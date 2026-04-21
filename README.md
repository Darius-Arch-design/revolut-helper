# SEPA Scan for Revolut

SEPA Scan for Revolut is a lightweight web app for scanning Croatian HUB3 2D payment barcodes and converting them into structured payment data for faster bill payments in Revolut. The app extracts key payment fields such as recipient IBAN, amount, model and reference number, validates the parsed content, and prepares EPC SEPA QR data when possible.

This project is designed for Croatian invoices and payment slips issued by utilities, telecom providers, gas companies, and similar billers. Its main goal is to reduce manual typing, lower the chance of payment entry mistakes, and make Revolut-based bill payments faster and more practical.

The app should be seen as a payment helper rather than a guaranteed direct Revolut QR payment integration. Even when automatic QR import is not supported, the app still provides a fast workflow by exposing clean payment data ready for manual entry.
