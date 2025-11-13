# Krishi-Setu Backend

A secure, scalable backend for the Krishi-Setu marketplace built with Node.js, Express, MongoDB and Firebase Admin SDK. Manages crops, buyers, sellers and their interactions with focus on authentication and data integrity.

## Table of contents

- Features
- Tech stack
- Quick start
- Environment
- API overview
- Authentication & guards
- Data behavior notes
- Contributing
- License

## Features

- Firebase ID token based authentication (Firebase Admin SDK)
- Route protection via middleware (only authenticated users can perform write actions)
- Crop management
  - Create, read (all & single), update, delete crops
- Buyer interest system
  - Send interest in a crop
  - Owners cannot send interest on their own crops
  - Prevent duplicate interests per user per crop
  - Owner can accept or reject interests
  - Accepting an interest auto-reduces crop quantity
- User dashboards
  - GET /api/my-posts — all crops posted by the authenticated user
  - GET /api/my-interests — all interests sent by the authenticated user

## Tech stack

- Node.js + Express.js — Backend REST API
- MongoDB Atlas — Database
- Firebase Admin SDK — Secure user authentication & token verification
- CORS — Cross-origin protection
- dotenv — Environment variables

## Quick start

1. Clone the repo
   git clone <repo-url>
2. Install dependencies
   npm install
3. Create a .env file (see Environment)
4. Start the server
   npm run dev
   or
   npm start

## Environment

Required environment variables (example):

- MONGODB_URI=<your-mongodb-connection-string>
- FIREBASE_PROJECT_ID=<project-id>
- FIREBASE_CLIENT_EMAIL=<client-email-from-service-account>
- FIREBASE_PRIVATE_KEY=<private-key-from-service-account> (handle newlines properly)
- PORT=5000

Storing the Firebase service account JSON and loading it via dotenv or the Admin SDK initializer is recommended.

## API overview (examples)

- Public
  - GET /api/crops — list all crops
  - GET /api/crops/:id — get crop details
- Authenticated (require valid Firebase ID token)
  - POST /api/crops — create a crop
  - PUT /api/crops/:id — update a crop (owner only)
  - DELETE /api/crops/:id — delete a crop (owner only)
  - POST /api/crops/:id/interests — send interest (not allowed for owner; prevents duplicates)
  - POST /api/interests/:id/accept — owner accepts an interest (reduces crop quantity)
  - POST /api/interests/:id/reject — owner rejects an interest
  - GET /api/my-posts — crops created by authenticated user
  - GET /api/my-interests — interests created by authenticated user

Note: Adjust routes/names to match your implementation.

## Authentication & route guards

- Clients must send a Firebase ID token in the Authorization header:
  Authorization: Bearer <ID_TOKEN>
- Middleware verifies token via Firebase Admin SDK and attaches user info to req.user.
- Handlers enforce ownership rules (e.g., only resource owners can update/delete; owners cannot express interest on their own crops).

## Data behavior & validation notes

- Prevent duplicate interests: ensure a unique constraint or check (userId + cropId).
- On accepting an interest:
  - Decrease crop.quantity by agreed amount
  - Prevent quantity from becoming negative
  - Mark interest status (accepted/rejected)
- Validate required fields for crops and interests; sanitize inputs before DB writes.
