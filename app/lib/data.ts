import { neon } from "@neondatabase/serverless";

import {
  CustomerField,
  CustomersTableType,
  InvoiceForm,
  InvoicesTable,
  LatestInvoiceRaw,
  Revenue,
} from "./definitions";
import { formatCurrency } from "./utils";

if (!process.env.POSTGRES_URL) {
  throw new Error("POSTGRES_URL environment variable is not defined");
}
const sql = neon(process.env.POSTGRES_URL);

/**
 * Fetches revenue data from the database.
 * 
 * @returns {Promise<Revenue[]>} A promise that resolves to an array of revenue data.
 * @throws {Error} If there is an error fetching the revenue data.
 */
export async function fetchRevenue() {
  try {
    // Artificially delay a response for demo purposes.

    console.log("Fetching revenue data...");
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // const data = await sql<Revenue>`SELECT * FROM revenue`;
    const data = await sql`SELECT * FROM revenue`;

    console.log('Data fetch completed after 1 sec.');

    // return data;

    // Mapea los resultados al tipo Revenue
    const revenueData: Revenue[] = data.map((row) => ({
      month: row.month,
      revenue: row.revenue,
    }));

    return revenueData;
  } catch (error) {
    console.error("Database Error:", error);
    throw new Error("Failed to fetch revenue data.");
  }
}

/**
 * Fetches the latest invoices from the database.
 * 
 * @returns {Promise<Array<Invoice>>} The latest invoices.
 * @throws {Error} If there is an error fetching the latest invoices.
 */
export async function fetchLatestInvoices() {
  try {
    // const data = await sql<LatestInvoiceRaw>`
    const data = await sql`
      SELECT invoices.amount, customers.name, customers.image_url, customers.email, invoices.id
      FROM invoices
      JOIN customers ON invoices.customer_id = customers.id
      ORDER BY invoices.date DESC
      LIMIT 5`;

    // const latestInvoices = data.rows.map((invoice) => ({
    const latestInvoices = data.map((invoice) => ({
      ...invoice,
      amount: formatCurrency(invoice.amount),
    }));
    return latestInvoices;
  } catch (error) {
    console.error("Database Error:", error);
    throw new Error("Failed to fetch the latest invoices.");
  }
}

/**
 * Retrieves card data from the database.
 *
 * @returns A promise that resolves to an object containing card data.
 * @throws {Error} If there is an error fetching the card data.
 */
export async function fetchCardData() {
  try {
    // You can probably combine these into a single SQL query
    // However, we are intentionally splitting them to demonstrate
    // how to initialize multiple queries in parallel with JS.
    const invoiceCountPromise = sql`SELECT COUNT(*) FROM invoices`;
    const customerCountPromise = sql`SELECT COUNT(*) FROM customers`;
    const invoiceStatusPromise = sql`SELECT
         SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) AS "paid",
         SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) AS "pending"
         FROM invoices`;

    /**
     * Retrieves data from multiple promises.
     *
     * @returns A promise that resolves to an array of data.
     */
    const data = await Promise.all([
      invoiceCountPromise,
      customerCountPromise,
      invoiceStatusPromise,
    ]);

    const numberOfInvoices = Number(data[0][0].count ?? "0");
    const numberOfCustomers = Number(data[1][0].count ?? "0");
    const totalPaidInvoices = formatCurrency(data[2][0].paid ?? "0");
    const totalPendingInvoices = formatCurrency(data[2][0].pending ?? "0");

    return {
      numberOfCustomers,
      numberOfInvoices,
      totalPaidInvoices,
      totalPendingInvoices,
    };
  } catch (error) {
    console.error("Database Error:", error);
    throw new Error("Failed to fetch card data.");
  }
}

const ITEMS_PER_PAGE = 6;
/**
 * Fetches filtered invoices based on the provided query and current page number.
 * @param query - The search query to filter invoices by.
 * @param currentPage - The current page number.
 * @returns A promise that resolves to an array of filtered invoices.
 * @throws An error if there is a database error or if fetching invoices fails.
 */
export async function fetchFilteredInvoices(
  query: string,
  currentPage: number
) {
  const offset = (currentPage - 1) * ITEMS_PER_PAGE;

  try {
    // const invoices = await sql<InvoicesTable>`
    //   SELECT
    //     invoices.id,
    //     invoices.amount,
    //     invoices.date,
    //     invoices.status,
    //     customers.name,
    //     customers.email,
    //     customers.image_url
    //   FROM invoices
    //   JOIN customers ON invoices.customer_id = customers.id
    //   WHERE
    //     customers.name ILIKE ${`%${query}%`} OR
    //     customers.email ILIKE ${`%${query}%`} OR
    //     invoices.amount::text ILIKE ${`%${query}%`} OR
    //     invoices.date::text ILIKE ${`%${query}%`} OR
    //     invoices.status ILIKE ${`%${query}%`}
    //   ORDER BY invoices.date DESC
    //   LIMIT ${ITEMS_PER_PAGE} OFFSET ${offset}
    // `;

    // Removed the type parameter <InvoicesTable[]> from the sql function call. The Neon driver typically infers types from the query result.
    // The query is now a single template literal, which is the correct way to use the sql tagged template function with Neon.
    // The parameters are interpolated directly into the template literal, which is how Neon handles parameterized queries .

    const invoices = await sql`
      SELECT invoices.id, invoices.amount, invoices.date, invoices.status, customers.name, customers.email, customers.image_url
      FROM invoices
      JOIN customers ON invoices.customer_id = customers.id
      WHERE 
        customers.name ILIKE ${"%" + query + "%"} OR
        customers.email ILIKE ${"%" + query + "%"} OR
        CAST(invoices.amount AS TEXT) ILIKE ${"%" + query + "%"} OR
        CAST(invoices.date AS TEXT) ILIKE ${"%" + query + "%"} OR
        invoices.status ILIKE ${"%" + query + "%"}
      ORDER BY invoices.date DESC
      LIMIT ${ITEMS_PER_PAGE} OFFSET ${offset}
    `;

    return invoices;
  } catch (error) {
    console.error("Database Error:", error);
    throw new Error("Failed to fetch invoices.");
  }
}

/**
 * Fetches the total number of invoice pages based on the given query.
 *
 * @param query - The search query to filter invoices.
 * @returns The total number of invoice pages.
 * @throws Error if failed to fetch the total number of invoices.
 */
export async function fetchInvoicesPages(query: string) {
  try {
    const count = await sql`SELECT COUNT(*)
    FROM invoices
    JOIN customers ON invoices.customer_id = customers.id
    WHERE
      customers.name ILIKE ${`%${query}%`} OR
      customers.email ILIKE ${`%${query}%`} OR
      invoices.amount::text ILIKE ${`%${query}%`} OR
      invoices.date::text ILIKE ${`%${query}%`} OR
      invoices.status ILIKE ${`%${query}%`}
  `;

    const totalPages = Math.ceil(Number(count[0].count) / ITEMS_PER_PAGE);
    return totalPages;
  } catch (error) {
    console.error("Database Error:", error);
    throw new Error("Failed to fetch total number of invoices.");
  }
}

/**
 * Fetches an invoice by its ID from the database.
 * 
 * @param id - The ID of the invoice to fetch.
 * @returns The fetched invoice object.
 * @throws Error if there is a database error or if the invoice fails to fetch.
 */
export async function fetchInvoiceById(id: string) {
  try {
    const data = await sql`
      SELECT
        invoices.id,
        invoices.customer_id,
        invoices.amount,
        invoices.status
      FROM invoices
      WHERE invoices.id = ${id};
    `;

    const invoice = data.map((invoice) => ({
      ...invoice,
      // Convert amount from cents to dollars
      amount: invoice.amount / 100,
    }));

    console.log(invoice); // Invoice is an empty array []
    return invoice[0];
  } catch (error) {
    console.error("Database Error:", error);
    throw new Error("Failed to fetch invoice.");
  }
}

/**
 * Fetches customers from the database.
 * 
 * @returns {Promise<Array<Object>>} The array of customers.
 * @throws {Error} If there is an error fetching the customers.
 */
export async function fetchCustomers(): Promise<CustomerField[]> {
  try {
    const data = await sql`
      SELECT
        id,
        name
      FROM customers
      ORDER BY name ASC
    `;

    // const customers = data;
    // return customers;
    return data.map((customer: any) => ({
      id: customer.id,
      name: customer.name,
    }));
  } catch (err) {
    console.error("Database Error:", err);
    throw new Error("Failed to fetch all customers.");
  }
}

/**
 * Fetches filtered customers based on the provided query.
 * 
 * @param query - The search query to filter customers by name or email.
 * @returns An array of customers with additional calculated properties for total pending and total paid amounts.
 * @throws {Error} If there is an error fetching the customer table from the database.
 */
export async function fetchFilteredCustomers(query: string) {
  try {
    const data = await sql`
		SELECT
		  customers.id,
		  customers.name,
		  customers.email,
		  customers.image_url,
		  COUNT(invoices.id) AS total_invoices,
		  SUM(CASE WHEN invoices.status = 'pending' THEN invoices.amount ELSE 0 END) AS total_pending,
		  SUM(CASE WHEN invoices.status = 'paid' THEN invoices.amount ELSE 0 END) AS total_paid
		FROM customers
		LEFT JOIN invoices ON customers.id = invoices.customer_id
		WHERE
		  customers.name ILIKE ${`%${query}%`} OR
        customers.email ILIKE ${`%${query}%`}
		GROUP BY customers.id, customers.name, customers.email, customers.image_url
		ORDER BY customers.name ASC
	  `;

    const customers = data.map((customer) => ({
      id: customer.id,
      name: customer.name,
      email: customer.email,
      image_url: customer.image_url,
      total_invoices: Number(customer.total_invoices),
      total_pending: formatCurrency(Number(customer.total_pending)),
      total_paid: formatCurrency(Number(customer.total_paid)),
    }));

    return customers;
  } catch (err) {
    console.error("Database Error:", err);
    throw new Error("Failed to fetch customer table.");
  }
}
