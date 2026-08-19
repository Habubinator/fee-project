import { createInvoice } from "../lib/monobank";

const ANNUAL_PRICE_CENTS = 12_00; // $12.00 USD

export async function createCheckout(userId: string) {
    return createInvoice(userId, ANNUAL_PRICE_CENTS);
}
