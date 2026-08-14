# Java DevSecOps Platform

A DevSecOps demonstration project built with Spring Boot microservices and a React frontend.

## Architecture

- **user-service** — Authentication and user management using JWT
- **product-service** — Product CRUD operations
- **order-service** — Order creation and order management
- **frontend** — React + Vite frontend
- **MySQL** — Database for the microservices

## Tech Stack

- Java
- Spring Boot
- Spring Security
- JWT
- MySQL
- React
- Vite
- Docker
- Docker Compose

## Project Structure

```text
java-devsecops-platform/
├── frontend/
├── user-service/
├── product-service/
├── order-service/
├── mysql/
├── docker-compose.yml
└── README.md


Run Locally

Make sure Docker and Docker Compose are installed.

From the project root:

docker compose up --build

The services will be available at:

Frontend       http://localhost:5173
User Service   http://localhost:8081
Product Service http://localhost:8082
Order Service  http://localhost:8083
Frontend Development

To run the React frontend separately:

cd frontend
npm install
npm run dev

Then open:

http://localhost:5173
API
User Service
POST /api/auth/register
POST /api/auth/login
GET  /api/users/me
Product Service
GET    /api/products
GET    /api/products/{id}
POST   /api/products
PUT    /api/products/{id}
DELETE /api/products/{id}
Order Service
POST /api/orders
GET  /api/orders/{id}
GET  /api/orders/my-orders

Protected APIs require a valid JWT token.

Configuration

Service configuration is managed through environment variables.

Default local configuration can be found in:

user-service/src/main/resources/application.yml
product-service/src/main/resources/application.yml
order-service/src/main/resources/application.yml
docker-compose.yml
DevSecOps

The project is intended to demonstrate:

Microservice architecture
Containerization with Docker
JWT-based authentication
Automated testing
Security scanning
CI/CD
Secure configuration management


### One small correction


Your original README says:


```bash
docker compose up --build