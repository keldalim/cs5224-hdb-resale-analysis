/** Display name used in the header and page title. Rename freely. */
export const APP_NAME = "Resale Evidence";
export const PROJECT_NAME = "HDB Resale Price Analysis Platform";
export const FEEDBACK_URL = (import.meta.env.VITE_FEEDBACK_URL ?? "").trim();
/**
 * The team's estimate API (src/lambda_handler.py, deployed behind API Gateway).
 * Production builds use it unless VITE_ESTIMATE_URL is set; `npm run dev` uses
 * demo data unless VITE_ESTIMATE_URL is set (localhost isn't in the API's CORS list).
 */
export const DEFAULT_ESTIMATE_URL = "https://a34gvnw0hg.execute-api.ap-southeast-1.amazonaws.com/estimate";
export const DATA_SOURCE_URL =
  "https://data.gov.sg/datasets/d_8b84c4ee58e3cfc0ece0d773c8ca6abc/view";
/** Where buyers can look up official resale prices themselves (linked when an estimate is withheld). */
export const HDB_PRICES_URL = "https://homes.hdb.gov.sg/home/finding-a-flat";
