# DevSecOps E-Commerce Platform on AWS EKS

## Overview

This project demonstrates the implementation of a complete **DevSecOps delivery platform for a containerized microservices-based e-commerce application on AWS**.

The objective of the project is to build an end-to-end platform where application source code moves through development, security validation, containerization, continuous integration, GitOps-based deployment, controlled production rollout, and continuous observability.

The application runs on **Amazon Elastic Kubernetes Service (Amazon EKS)** and consists of a frontend and three backend microservices. The platform integrates **Jenkins, SonarQube, Gitleaks, Trivy, Amazon ECR, Argo CD, Argo Rollouts, Prometheus, Grafana, Loki, Grafana Alloy, OpenTelemetry, and Grafana Tempo**.

The project is designed to demonstrate how DevOps and security practices can be integrated into a single Kubernetes-based application delivery workflow rather than treating security, deployment, and monitoring as separate activities.

---

## What This Project Demonstrates

The project covers the following areas:

* AWS networking and infrastructure design
* Amazon VPC with public, private, and data subnets
* Bastion host for controlled administrative access
* Private Jenkins server
* Amazon EKS cluster deployment
* Amazon RDS MySQL
* Amazon ECR container registry
* Kubernetes application deployment
* CI pipeline using Jenkins
* Static code analysis using SonarQube
* Secret detection using Gitleaks
* Container vulnerability scanning using Trivy
* GitOps-based continuous delivery using Argo CD
* Blue-Green deployment using Argo Rollouts
* Kubernetes Gateway API
* AWS Load Balancer Controller
* Route 53 DNS
* ACM TLS certificates
* Prometheus-based metrics collection
* Alertmanager email notifications
* Grafana dashboards
* Loki centralized logging
* Grafana Alloy log collection
* OpenTelemetry-based distributed tracing
* Grafana Tempo trace storage
* Amazon S3 for persistent Loki and Tempo data

---

# Application Architecture

The application is implemented as a microservices-based e-commerce platform.

It contains four primary application components:

### Frontend

The frontend provides the user interface through which users can register, log in, view products, and place orders.

### User Service

The User Service manages user registration and authentication.

It is responsible for:

* User registration
* User login
* Credential validation
* JWT token generation
* User-related operations

### Product Service

The Product Service manages the products available in the application.

It is responsible for:

* Creating products
* Retrieving products
* Managing product information
* Maintaining product price and quantity

### Order Service

The Order Service manages customer orders.

It is responsible for:

* Creating orders
* Processing order requests
* Maintaining order information
* Associating orders with users and products

---

## Application Service Communication

The application services communicate through Kubernetes Services.

```text
                         Internet
                            |
                            v
                       Application
                         Frontend
                            |
              +-------------+-------------+
              |             |             |
              v             v             v
        User Service  Product Service  Order Service
              |             |             |
              +-------------+-------------+
                            |
                            v
                       MySQL / RDS
```

Each backend service runs independently inside the Kubernetes cluster.

Kubernetes provides service discovery and networking between the services, allowing pods to be replaced or scaled without changing the service endpoints used by other components.

---

# Database Architecture

The backend uses **Amazon RDS for MySQL** as the relational database platform.

The project uses separate logical databases for the individual backend services:

```text
Amazon RDS MySQL
│
├── userdb
├── productdb
└── orderdb
```

The RDS instance is deployed in dedicated data subnets within the VPC.

The database is not directly exposed to the public internet. Access is controlled through AWS security groups, allowing connections only from the required infrastructure and Kubernetes workloads.

---

# DevSecOps Architecture

The project implements security and quality checks as part of the application delivery process.

The high-level CI workflow is:

```text
Developer
    |
    v
  GitHub
    |
    v
 Jenkins
    |
    +---- Source Checkout
    |
    +---- Build
    |
    +---- Unit Tests
    |
    +---- SonarQube Analysis
    |
    +---- Gitleaks Secret Scan
    |
    +---- Docker Image Build
    |
    +---- Trivy Image Scan
    |
    v
Amazon ECR
```

This approach ensures that security and quality validation happen before application images are used for deployment.

### SonarQube

SonarQube performs static code analysis and helps identify:

* Bugs
* Code smells
* Maintainability issues
* Security-related code issues
* Overall code quality

### Gitleaks

Gitleaks scans the source repository for accidentally committed secrets such as:

* Passwords
* API keys
* Tokens
* Credentials
* Other sensitive values

### Trivy

Trivy scans container images for known vulnerabilities before they are deployed into the Kubernetes environment.

---

# GitOps and Continuous Delivery

After the CI process produces a validated container image, deployment is handled using a GitOps approach.

**Argo CD** is responsible for synchronizing the Kubernetes configuration stored in Git with the actual state of the EKS cluster.

```text
                  GitHub
                    |
          Kubernetes Manifests
                    |
                    v
                 Argo CD
                    |
                    v
                Amazon EKS
                    |
                    v
             Application Pods
```

Git acts as the source of truth for the Kubernetes deployment configuration.

This separates the responsibilities of the CI and CD systems:

* **Jenkins** — builds, tests, and scans the application
* **Amazon ECR** — stores container images
* **GitHub** — stores application and Kubernetes configuration
* **Argo CD** — synchronizes Kubernetes resources
* **Amazon EKS** — runs the application

---

# Blue-Green Deployment

The project uses **Argo Rollouts** to implement controlled Blue-Green deployments.

Instead of immediately replacing the running production version, a new application version is deployed as a preview version.

The new version can then be tested before it receives production traffic.

```text
                  Application
                       |
              +--------+--------+
              |                 |
              v                 v
           Stable            Preview
           Version            Version
              |                 |
              |              Validation
              |                 |
              +--------+--------+
                       |
                  Manual Promote
                       |
                       v
                 New Stable Version
```

This allows the deployment process to validate a new release before promoting it to production.

If the new version fails validation, it can be rejected without immediately replacing the stable version.

---

# Kubernetes Platform

The application runs on **Amazon EKS**.

The Kubernetes environment is divided into multiple namespaces according to responsibility.

Examples include:

```text
devsecops
argocd
argo-rollouts
monitoring
loki
tempo
alloy
kube-system
```

The cluster also uses AWS-integrated components for production-style networking and infrastructure management.

These include:

* AWS Load Balancer Controller
* Kubernetes Gateway API
* Cluster Autoscaler
* Amazon EBS CSI Driver
* EKS Pod Identity

---

# AWS Infrastructure

The project uses a dedicated VPC with separate subnet groups for different workloads.

```text
AWS VPC
10.0.0.0/16
│
├── Public Subnets
│   ├── 10.0.1.0/24
│   └── 10.0.2.0/24
│
├── Private Subnets
│   ├── 10.0.11.0/24
│   └── 10.0.12.0/24
│
└── Data Subnets
    ├── 10.0.21.0/24
    └── 10.0.22.0/24
```

The public subnets are used for internet-facing infrastructure such as the bastion host and networking components.

The private subnets are used for internal infrastructure and Kubernetes workloads.

The data subnets are dedicated to data-layer resources such as Amazon RDS.

A NAT Gateway provides controlled outbound internet access for resources located in private subnets.

---

# External Access

The application is exposed through an AWS Application Load Balancer managed by the **AWS Load Balancer Controller**.

The project uses:

* Route 53 for DNS
* ACM for TLS certificates
* Kubernetes Gateway API for application routing
* AWS Load Balancer Controller for AWS load-balancer integration

The external request flow is:

```text
User
 |
 v
Route 53
 |
 v
HTTPS / ACM
 |
 v
AWS Application Load Balancer
 |
 v
Kubernetes Gateway
 |
 v
Application Services
 |
 v
EKS Pods
```

This provides HTTPS-based access to the application while keeping the backend workloads inside the Kubernetes environment.

---

# Observability

Observability is implemented across three areas:

## Metrics

**Prometheus** collects infrastructure and application metrics.

**Grafana** provides dashboards for visualizing those metrics.

The monitoring stack is used to observe:

* Kubernetes resources
* Application health
* Request rates
* Error rates
* Resource utilization
* Application performance

---

## Logging

Application and Kubernetes logs are collected using **Grafana Alloy** and sent to **Grafana Loki**.

```text
Kubernetes Pods
       |
       v
 Grafana Alloy
       |
       v
      Loki
       |
       v
    Grafana
```

Loki uses Amazon S3 as persistent object storage for log data.

This allows logs to remain available even when Kubernetes pods are recreated.

---

## Distributed Tracing

The project uses **OpenTelemetry** and **Grafana Tempo** to implement distributed tracing.

```text
Application
     |
     v
OpenTelemetry
     |
     v
Grafana Alloy / Collector
     |
     v
   Tempo
     |
     v
  Grafana
```

Tracing provides visibility into the path of a request across multiple microservices.

For example, a single user request can be followed as it moves through the frontend, User Service, Product Service, and Order Service.

---

# Security Architecture

Security is implemented at multiple layers rather than relying on a single security tool.

### Infrastructure Security

* Private subnets for internal workloads
* Dedicated data subnets for RDS
* Security groups controlling network access
* Bastion host for administrative access
* IAM roles for AWS resource access

### CI Security

* SonarQube for source-code analysis
* Gitleaks for secret detection
* Trivy for container vulnerability scanning

### Kubernetes Security

* Kubernetes namespaces
* Kubernetes Secrets for application configuration
* IAM-based workload access
* EKS Pod Identity
* Controlled AWS security-group access

### Data Security

* Private RDS deployment
* S3 public-access blocking
* S3 encryption
* IAM-controlled access to Loki and Tempo storage

---

# Complete Project Flow

The complete lifecycle of the project can be summarized as:

```text
                    Developer
                        |
                        v
                     GitHub
                        |
                        v
                     Jenkins
                        |
        +---------------+---------------+
        |               |               |
        v               v               v
    SonarQube         Gitleaks        Trivy
        |               |               |
        +---------------+---------------+
                        |
                        v
                  Docker Image
                        |
                        v
                    Amazon ECR
                        |
                        |
             Kubernetes Manifests
                        |
                        v
                     Argo CD
                        |
                        v
                  Argo Rollouts
                        |
                        v
                   Amazon EKS
                        |
          +-------------+-------------+
          |             |             |
          v             v             v
       Frontend     User Service  Product Service
                                      |
                                      v
                                Order Service
                                      |
                                      v
                                  RDS MySQL


                 Observability
                       |
        +--------------+--------------+
        |              |              |
        v              v              v
    Prometheus        Loki          Tempo
        |              ^              ^
        |              |              |
        |            Alloy       OpenTelemetry
        |              |              |
        +--------------+--------------+
                       |
                       v
                    Grafana
```

---

# Project Goal

The goal of this project is not simply to deploy a Java application into Kubernetes.

The project demonstrates a complete engineering workflow in which **application development, security, infrastructure, CI/CD, GitOps, deployment strategy, cloud integration, and observability work together as one platform**.

The final environment provides:

* A microservices-based application running on EKS
* Automated CI with security and quality checks
* Container images stored in Amazon ECR
* GitOps-based deployment through Argo CD
* Blue-Green deployments through Argo Rollouts
* AWS-managed networking and DNS
* Secure connectivity to Amazon RDS
* Centralized metrics, logs, and traces
* Grafana-based observability
* Persistent log and trace storage using Amazon S3

The implementation section that follows this overview explains how each layer is built and configured step by step.
