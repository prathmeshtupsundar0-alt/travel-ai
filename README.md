# TravelAI

Traveling AI is a React/Vite travel planner with an Express, MongoDB, and Mongoose backend. It provides JWT authentication, MongoDB-backed trips and expenses, Gemini itinerary generation, estimated budgets, and optional live weather and OpenStreetMap route data. It contains no demo trips or fabricated external-service responses.

## Architecture

```
frontend/  React + Vite + Axios
backend/   Express + Mongoose + MongoDB + JWT
```

## Requirements

- Node.js 20+
- MongoDB running locally or a MongoDB Atlas connection string

## Setup

Create `backend/.env` from `backend/.env.example` and set a real `MONGODB_URI`, `JWT_SECRET` (at least 32 characters), `GEMINI_API_KEY`, and `FRONTEND_URL`. Create `frontend/.env` from `frontend/.env.example` if the backend URL differs.

Start the API:

```bash
cd backend
npm install
npm run dev
```

Start the UI in another terminal:

```bash
cd frontend
npm install
npm run dev
```

The API health check is `GET http://localhost:5000/api/health`. MongoDB collections are created by Mongoose when documents are first inserted.

## API

- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `GET /api/users/profile`
- `GET|POST /api/trips`, `GET|PUT|DELETE /api/trips/:id`
- `POST /api/ai/generate-itinerary`
- `GET|POST /api/expenses/:tripId`, `PUT|DELETE /api/expenses/item/:expenseId`
- `GET /api/trip-data/:tripId/weather`, `GET /api/trip-data/:tripId/route`

Use the included [Postman collection](backend/TravelAI.postman_collection.json). Login/register set an httpOnly cookie for browser use and also return a JWT for Postman; set it as `Authorization: Bearer <token>`. Test register, login, me, create/list/get/update/delete trip in that order. Test editor/viewer permissions by creating a `TripMember` with the appropriate role in MongoDB; viewers receive `403` on updates/deletes.

## Deployment

Deploy `frontend` as a static Vite app and `backend` to Render, Railway, or a similar Node host. Set `MONGODB_URI`, `JWT_SECRET`, `FRONTEND_URL`, and `NODE_ENV=production` in the backend environment, then point `VITE_API_URL` at the deployed `/api` URL.
