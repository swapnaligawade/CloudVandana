# Salesforce CRUD Console

A React + Node.js web application for OAuth-secured CRUD operations on Salesforce **Account, Opportunity, Lead, Contact, and Case** objects. It displays up to ten suitable fields per object and loads records in batches of 20 using infinite scroll.

## Run locally

1. Create a Salesforce Developer Org at [developer.salesforce.com/signup](https://developer.salesforce.com/signup).
2. In Setup, search **External Client App**, create one, and enable OAuth. Add the callback URL `http://localhost:3000/auth/callback`. Enable the `api` and `refresh_token, offline_access` OAuth scopes. Copy its Consumer Key and Consumer Secret.
3. Copy `.env.example` to `.env` and fill in `SF_CLIENT_ID`, `SF_CLIENT_SECRET`, and a strong `SESSION_SECRET`.
4. Install and run:

   ```bash
   npm install
   npm run dev
   ```

5. Open `http://localhost:5173` and choose **Log in to Salesforce**.

## Production deployment

Live application: [https://cloudvandana-salesforce-crud.vercel.app](https://cloudvandana-salesforce-crud.vercel.app)

Set `APP_URL` to the deployed app origin and `SF_REDIRECT_URI` to `https://your-domain/auth/callback`; add that exact callback URL to the External Client App. Run `npm run build`, then start with `NODE_ENV=production npm start`. The Express server serves the built React application.

## Security notes

OAuth access tokens remain in an HTTP-only server session and are never returned to browser JavaScript. Add HTTPS, a persistent session store, and an appropriate session secret before a public deployment.
