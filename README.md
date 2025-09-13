# School Payments & Dashboard - Backend

This repository contains the backend microservice for the  School Payments and Dashboard Application .  
It is built with  NestJS  and uses  MongoDB Atlas  as the database.  
The service handles payments, webhooks, and transaction management, and is deployed on a  KVM server with Nginx .

---
Deployment

Deployed on KVM server with Nginx reverse proxy and PM2.

Example Nginx configuration:

server {
    listen 80;
    server_name edviron-api.skill-jackpot.com;

    location / {
        proxy_pass http://localhost:3095;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
## Features

-  Payment API Integration 
  - `POST /create-payment` to initiate a payment
  - Signs payloads using JWT and forwards to payment provider
  - Returns a redirect URL for completing payments

-  Webhook Handling 
  - `POST /webhook` to process provider callbacks
  - Updates transaction details in MongoDB
  - Logs payloads for auditing and debugging

-  Transactions API 
  - `GET /transactions` → Fetch all transactions (with pagination and filters)
  - `GET /transactions/school/:schoolId` → Transactions for a specific school
  - `GET /transaction-status/:custom_order_id` → Current status of a transaction

-  Authentication 
  - JWT authentication for all protected routes
  - `POST /auth/login` and `POST /auth/signup`

-  Security 
  - Helmet for HTTP headers
  - Rate limiting
  - Input validation with `class-validator`

---

## Schemas

-  Order Schema  – Stores order details (school, student info, gateway, etc.)
-  Order Status Schema  – Stores payment status, amounts, and provider details
-  Webhook Logs Schema  – Stores webhook requests for auditing
-  User Schema  – For authentication and authorization

---



