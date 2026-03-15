# Cloud Deployment (Azure, AWS, GCP, Alibaba Cloud)

This guide is designed so anyone can:

1. Download the code
2. Modify it
3. Deploy it to their preferred cloud

The recommended approach for all clouds is **container-based deployment**:

- Backend container: Django API
- Frontend container: static SPA hosting
- Database: managed PostgreSQL

## Prerequisites (All Clouds)

- Docker Desktop installed
- A cloud account (Azure/AWS/GCP/Alibaba)
- A managed PostgreSQL instance (recommended) or SQLite for demo-only
- A domain name (optional) for HTTPS

## Environment Variables (Backend)

Set these in your cloud runtime:

- `DJANGO_SECRET_KEY` (required)
- `DJANGO_DEBUG` (`false` in production)
- `DJANGO_ALLOWED_HOSTS` (comma-separated hostnames)
- `FRONTEND_BASE_URL` (public URL of the frontend)
- `DJANGO_DB_ENGINE` (for PostgreSQL: `django.db.backends.postgresql`)
- `DJANGO_DB_NAME`
- `DJANGO_DB_USER`
- `DJANGO_DB_PASSWORD`
- `DJANGO_DB_HOST`
- `DJANGO_DB_PORT`
- `TEAMS_WEBHOOK_URL` (optional)
- `SLACK_WEBHOOK_URL` (optional)
- `DEFAULT_FROM_EMAIL` (optional, if email configured)

## Build Containers (Local)

From repo root:

```powershell
docker build -t itsm-backend:latest .\backend
docker build -t itsm-frontend:latest .\frontend
```

## Database: PostgreSQL (Recommended)

Run migrations after deploying the backend (or in a one-off job):

```powershell
python manage.py migrate
python manage.py seed_demo --reset
```

In cloud, run these via:

- a one-off container/job/task (recommended), or
- a temporary exec shell into the backend container

## Azure Deployment (Recommended: Azure Container Apps)

### 1) Create resources

1. Create an Azure Resource Group.
2. Create an Azure Container Registry (ACR).
3. Create Azure Database for PostgreSQL (Flexible Server).
4. Create Azure Container Apps environment.

### 2) Push images to ACR

```powershell
az login
az acr login --name <acrName>

docker tag itsm-backend:latest <acrName>.azurecr.io/itsm-backend:latest
docker tag itsm-frontend:latest <acrName>.azurecr.io/itsm-frontend:latest

docker push <acrName>.azurecr.io/itsm-backend:latest
docker push <acrName>.azurecr.io/itsm-frontend:latest
```

### 3) Deploy backend Container App

- Create a Container App for the backend image.
- Set environment variables listed above.
- Configure ingress (public).
- Set `DJANGO_ALLOWED_HOSTS` to the container app hostname and/or your custom domain.

### 4) Deploy frontend Container App

- Create a Container App for the frontend image.
- Configure ingress (public).
- Set frontend to call backend URL via your frontend config (typically the `api.ts` base URL strategy used in the SPA).

### 5) Run migrations (one-off job)

Create a temporary Container Apps Job with the backend image:

```powershell
python manage.py migrate
python manage.py seed_demo --reset
```

### 6) TLS/Custom domain (optional)

- Attach a custom domain to each Container App.
- Configure managed certificates or upload certificates.

## AWS Deployment (Recommended: ECS Fargate + RDS)

### 1) Create resources

1. Create an ECR repo for backend and frontend.
2. Create an RDS PostgreSQL instance.
3. Create an ECS cluster (Fargate).
4. Create an Application Load Balancer (ALB).

### 2) Push images to ECR

```powershell
aws configure

aws ecr get-login-password --region <region> | docker login --username AWS --password-stdin <accountId>.dkr.ecr.<region>.amazonaws.com

docker tag itsm-backend:latest <accountId>.dkr.ecr.<region>.amazonaws.com/itsm-backend:latest
docker tag itsm-frontend:latest <accountId>.dkr.ecr.<region>.amazonaws.com/itsm-frontend:latest

docker push <accountId>.dkr.ecr.<region>.amazonaws.com/itsm-backend:latest
docker push <accountId>.dkr.ecr.<region>.amazonaws.com/itsm-frontend:latest
```

### 3) Create ECS services

- Backend service behind ALB (port 8000, health check `/api/me/` or `/api/analytics/`).
- Frontend service behind ALB (port 80).
- Store secrets in AWS Secrets Manager or SSM Parameter Store and inject into task definition.

### 4) Run migrations (one-off task)

Run an ECS one-off task using the backend task definition:

```powershell
python manage.py migrate
python manage.py seed_demo --reset
```

### 5) TLS/Domain (optional)

- Use ACM for certificates.
- Route53 for DNS.

## Google Cloud Deployment (Recommended: Cloud Run + Cloud SQL)

### 1) Create resources

1. Create a GCP project and enable:
   - Cloud Run
   - Artifact Registry
   - Cloud SQL Admin API
2. Create Cloud SQL (PostgreSQL).
3. Create Artifact Registry repositories (backend/frontend).

### 2) Push images to Artifact Registry

```powershell
gcloud auth login
gcloud auth configure-docker <region>-docker.pkg.dev

docker tag itsm-backend:latest <region>-docker.pkg.dev/<projectId>/<repo>/itsm-backend:latest
docker tag itsm-frontend:latest <region>-docker.pkg.dev/<projectId>/<repo>/itsm-frontend:latest

docker push <region>-docker.pkg.dev/<projectId>/<repo>/itsm-backend:latest
docker push <region>-docker.pkg.dev/<projectId>/<repo>/itsm-frontend:latest
```

### 3) Deploy Cloud Run services

- Deploy backend Cloud Run service:
  - Connect Cloud SQL
  - Set env vars
  - Set concurrency and min instances as required
- Deploy frontend Cloud Run service (or use Cloud Storage + CDN for static hosting).

### 4) Run migrations (Cloud Run Job)

Create a Cloud Run Job using backend image:

```powershell
python manage.py migrate
python manage.py seed_demo --reset
```

### 5) TLS/Domain (optional)

- Map a custom domain to Cloud Run services.
- Use Cloud Load Balancing if consolidating multiple services under one domain.

## Alibaba Cloud Deployment (Recommended: ACK (Kubernetes) + ApsaraDB RDS)

### Option A: ACK (Kubernetes) + Ingress

1. Create a VPC and ACK cluster.
2. Create ApsaraDB RDS for PostgreSQL.
3. Create Alibaba Cloud Container Registry (ACR) repos for images.
4. Push images to Alibaba ACR.
5. Deploy:
   - Backend Deployment + Service
   - Frontend Deployment + Service
   - Ingress for routing and TLS
6. Run migrations via a Kubernetes Job:

```powershell
python manage.py migrate
python manage.py seed_demo --reset
```

### Option B: Serverless App Engine (SAE) + RDS

1. Create RDS PostgreSQL.
2. Push images to Alibaba ACR.
3. Create two SAE apps:
   - backend (Django)
   - frontend (static SPA)
4. Configure env vars and domains.
5. Run migrations as an SAE task/job (or temporary instance exec).

## Recommended Deployment Layout

- **Frontend**
  - Static hosting (CDN) preferred for performance
  - Cloud Run / Container Apps / ECS service also works
- **Backend**
  - Container runtime (Container Apps / ECS / Cloud Run / ACK)
- **Database**
  - Managed PostgreSQL
- **Secrets**
  - Store in managed secret service per cloud:
    - Azure Key Vault
    - AWS Secrets Manager
    - GCP Secret Manager
    - Alibaba KMS/Secrets Manager equivalent

## Post-Deployment Checklist

- `DJANGO_DEBUG=false`
- `DJANGO_ALLOWED_HOSTS` configured correctly
- Database migrations applied
- CORS configured for your frontend domain
- HTTPS enabled
- Backups enabled for PostgreSQL
- Monitoring/logging enabled

