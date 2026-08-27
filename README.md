# DevSecOps Project — End-to-End Implementation Guide

> **Purpose:** This document is the implementation runbook for deploying the DevSecOps platform on AWS from an empty AWS environment to a working application with CI/CD, security scanning, GitOps, blue/green deployments, metrics, logs, traces, and public HTTPS access.
>
> The goal is that another engineer can follow this document **step by step and understand why each step exists**, not merely copy commands.

---

## 0. Important Security Notice

The original notes contained real-looking AWS access keys, database passwords, Gmail app passwords, JWT secrets, SonarQube tokens, and other credentials.

**Those values must not be stored in `README.md`, Git, screenshots, Jenkinsfiles, or Kubernetes manifests.**

Before using this project:

1. Revoke/rotate any credentials that were previously exposed.
2. Create new credentials where required.
3. Replace every `<PLACEHOLDER>` in this document with your own value.
4. Prefer AWS IAM roles, EKS Pod Identity, Kubernetes Secrets, Jenkins Credentials, and secret managers instead of hard-coding credentials.

This document intentionally uses placeholders such as:

- `<AWS_ACCOUNT_ID>`
- `<AWS_REGION>`
- `<VPC_ID>`
- `<RDS_ENDPOINT>`
- `<RDS_PASSWORD>`
- `<GITHUB_REPOSITORY>`
- `<DOMAIN>`
- `<ACM_CERTIFICATE_ARN>`
- `<GMAIL_APP_PASSWORD>`
- `<SONARQUBE_TOKEN>`

---

# 1. Solution Overview

The platform contains the following major components:

- AWS VPC
- Public, private, and data subnets
- Internet Gateway
- NAT Gateway
- Bastion EC2 instance
- Jenkins EC2 instance
- Amazon EKS
- Amazon ECR
- Amazon RDS MySQL
- AWS Load Balancer Controller
- Kubernetes Gateway API
- Route 53
- ACM
- Argo CD
- Argo Rollouts
- Maven
- SonarQube
- Trivy
- Gitleaks
- Prometheus
- Alertmanager
- Grafana
- Loki
- Grafana Alloy
- Tempo
- Amazon S3 for Loki and Tempo storage
- EBS CSI Driver
- GitHub
- Kustomize

---

# 2. Overall Architecture

## 2.1 AWS Infrastructure Architecture

```text
                              Internet
                                  |
                           Route 53 DNS
                                  |
                            ACM Certificate
                                  |
                         AWS Load Balancer
                                  |
                    +-------------+-------------+
                    |                           |
              Public Subnets              Public Subnets
              10.0.1.0/24                 10.0.2.0/24
                    |                           |
              Bastion EC2                 NAT Gateway
                    |                           |
                    |                     Private Subnets
                    |                     10.0.11.0/24
                    |                     10.0.12.0/24
                    |                           |
                    |                    EKS Worker Nodes
                    |                           |
                    |                 +---------+---------+
                    |                 |         |         |
                    |              Frontend   Backend   Monitoring
                    |                 |       Services    Stack
                    |                 |       |           |
                    |                 |       |        Grafana
                    |                 |       |        Prometheus
                    |                 |       |        Loki
                    |                 |       |        Tempo
                    |                 |       |
                    |                 |     RDS MySQL
                    |                 |
                    +---------- Jenkins EC2
                                      |
                                CI/CD Pipeline
```

---

## 2.2 CI/CD and GitOps Architecture

```text
Developer
   |
   v
GitHub
   |
   | source code
   v
Jenkins
   |
   +--> Maven Build
   |
   +--> Unit Tests
   |
   +--> Gitleaks
   |
   +--> SonarQube
   |
   +--> Trivy
   |
   +--> Docker Build
   |
   +--> Docker Image
   |
   v
Amazon ECR
   |
   | image reference
   v
Git / Kustomize
   |
   v
Argo CD
   |
   v
EKS
   |
   v
Argo Rollouts
   |
   +--> Stable Version
   |
   +--> Preview Version
   |
   +--> Manual Promotion
```

---

## 2.3 Observability Architecture

```text
Kubernetes Applications
        |
        +----------------------+
        |                      |
        v                      v
   Application Logs        OpenTelemetry
        |                      |
        v                      v
   Grafana Alloy        OTEL instrumentation
        |                      |
        v                      v
       Loki                  Tempo
        |                      |
        +----------+-----------+
                   |
                   v
                Grafana
                   |
        +----------+----------+
        |          |          |
     Metrics      Logs      Traces
        |          |          |
   Prometheus     Loki       Tempo
```

---

# 3. Prerequisites

You need:

- An AWS account
- A domain name
- A GitHub repository
- Windows local machine
- Git Bash or Command Prompt
- AWS CLI
- SSH key pair (`demo.pem` in the original setup)
- IAM permissions sufficient to create the required infrastructure
- A Gmail account if email alerting is required

AWS region used by this project:

```text
ap-south-1
```

---

# 4. Configure AWS CLI on Windows

## 4.1 Install AWS CLI

Download and install AWS CLI for Windows:

https://awscli.amazonaws.com/AWSCLIV2.msi

After installation:

```bash
aws --version
```

## 4.2 Configure AWS CLI

```bash
aws configure
```

Enter your newly generated credentials:

```text
AWS Access Key ID: <AWS_ACCESS_KEY_ID>
AWS Secret Access Key: <AWS_SECRET_ACCESS_KEY>
Default region name: ap-south-1
Default output format: json
```

## 4.3 Verify AWS Access

```bash
aws sts get-caller-identity
aws s3 ls
```

If these commands work, the local AWS CLI configuration is valid.

---

# 5. Create the VPC

Create:

```text
VPC Name: devsecops-vpc
CIDR:     10.0.0.0/16
```

## 5.1 Internet Gateway

Create:

```text
devsecops-igw
```

Attach it to:

```text
devsecops-vpc
```

---

# 6. Create Subnets

Create two subnets in different Availability Zones for high availability.

## 6.1 Public Subnets

| Name | CIDR | Public IPv4 |
|---|---|---|
| devsecops-pub-subnet-1a | 10.0.1.0/24 | Enabled |
| devsecops-pub-subnet-1b | 10.0.2.0/24 | Enabled |

## 6.2 Private Subnets

| Name | CIDR |
|---|---|
| devsecops-private-subnet-1a | 10.0.11.0/24 |
| devsecops-private-subnet-1b | 10.0.12.0/24 |

## 6.3 Data Subnets

| Name | CIDR |
|---|---|
| devsecops-data-subnet-1a | 10.0.21.0/24 |
| devsecops-data-subnet-1b | 10.0.22.0/24 |

The data subnets are used for RDS.

---

# 7. Create NAT Gateway

Create:

```text
devsecops-nat-gw
```

Place the NAT Gateway in a public subnet and associate an Elastic IP.

The purpose of the NAT Gateway is to allow resources in private subnets to reach the internet without making those resources publicly reachable.

---

# 8. Create Route Tables

## 8.1 Public Route Table

Create:

```text
devsecops-pub-rt
```

Add:

```text
0.0.0.0/0 -> devsecops-igw
```

Associate:

- devsecops-pub-subnet-1a
- devsecops-pub-subnet-1b

## 8.2 Private Route Table

Create:

```text
devsecops-private-rt
```

Add:

```text
0.0.0.0/0 -> devsecops-nat-gw
```

Associate:

- devsecops-private-subnet-1a
- devsecops-private-subnet-1b
- devsecops-data-subnet-1a
- devsecops-data-subnet-1b

---

# 9. Security Groups

## 9.1 Bastion Security Group

Name:

```text
bastion-sg
```

Required access:

- SSH 22 from your administrative IP
- Ports 8080, 9000, 9090, and 3000 as required for temporary SSH tunnel/port-forward access

**Do not expose these ports to `0.0.0.0/0` unnecessarily.** Restrict them to your own public IP where possible.

## 9.2 Jenkins Security Group

Name:

```text
jenkins-sg
```

Allow:

- 22 from `bastion-sg`
- 8080 from `bastion-sg`
- 9000 from `bastion-sg`

## 9.3 RDS Security Group

Name:

```text
devsecops-rds-sg
```

Allow:

```text
TCP 3306
Source: bastion-sg
Source: EKS security group / node security group as appropriate
```

Do not expose MySQL port 3306 to the public internet.

---

# 10. Launch Bastion EC2

Create:

```text
Name:       bastion-server
AMI:        Amazon Linux
Type:       t3.small
Key pair:   demo.pem
VPC:        devsecops-vpc
Subnet:     devsecops-pub-subnet-1a
SG:         bastion-sg
Storage:    8 GB
```

The bastion is the administration entry point into the private environment.

---

# 11. Launch Jenkins EC2

Create:

```text
Name:       jenkins-server
AMI:        Amazon Linux
Type:       c7i-flex.large
Key pair:   demo.pem
VPC:        devsecops-vpc
Subnet:     devsecops-private-subnet-1a
SG:         jenkins-sg
Storage:    20 GB
```

Jenkins is deliberately placed in the private subnet.

---

# 12. Connect to Bastion

From Windows:

```bash
ssh -i demo.pem ec2-user@<BASTION_PUBLIC_IP>
```

Become root:

```bash
sudo su -
```

Set hostname:

```bash
hostnamectl set-hostname bastion
```

---

# 13. Install Bastion Tools

## 13.1 Git and Docker

```bash
dnf install -y git docker

git --version
docker version

systemctl enable docker
systemctl start docker
systemctl status docker
```

## 13.2 MariaDB Client

This is used to test connectivity to RDS MySQL.

```bash
dnf install -y mariadb105
mysql --version
```

---

# 14. Install kubectl on Bastion

```bash
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"

sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl

chmod +x kubectl

mkdir -p ~/.local/bin

mv ./kubectl ~/.local/bin/kubectl

kubectl version --client
```

---

# 15. Install eksctl on Bastion

```bash
ARCH=amd64
PLATFORM=$(uname -s)_$ARCH

curl -sLO "https://github.com/eksctl-io/eksctl/releases/latest/download/eksctl_$PLATFORM.tar.gz"
```

Optional checksum verification:

```bash
curl -sL "https://github.com/eksctl-io/eksctl/releases/latest/download/eksctl_checksums.txt" \
  | grep $PLATFORM \
  | sha256sum --check
```

Install:

```bash
tar -xzf eksctl_$PLATFORM.tar.gz -C /tmp

rm eksctl_$PLATFORM.tar.gz

sudo install -m 0755 /tmp/eksctl /usr/local/bin

rm /tmp/eksctl

eksctl version
```

---

# 16. Create IAM Role for Bastion

Before creating the EKS cluster from Bastion:

1. Create an IAM role named something such as:
   `iam-role-ec2`
2. Trust entity:
   `EC2`
3. Attach the required administrative permissions.

For a learning/lab environment, the original setup used `AdministratorAccess`.

**For production, do not give Bastion AdministratorAccess. Use least-privilege IAM policies instead.**

Attach this IAM role to the Bastion EC2 instance.

Verify:

```bash
aws sts get-caller-identity
```

---

# 17. Clone the Project Repository

From Bastion:

```bash
cd /opt

git clone <GITHUB_REPOSITORY>

cd devsecops-project
```

Example repository structure:

```text
devsecops-project/
├── Jenkinsfile
├── README.md
├── eksctl-config.yaml
├── iam_policy.json
├── cluster-autoscaler-policy.json
├── loki-s3-policy.json
├── loki-pod-identity-trust.json
├── ebs-csi-trust.json
├── tempo-s3-policy.json
├── tempo-pod-identity-trust.json
├── k8s/
├── frontend/
├── user-service/
├── product-service/
├── order-service/
└── mysql/
```

---

# 18. Create EKS Cluster

Edit:

```bash
vi eksctl-config.yaml
```

Update:

- VPC ID
- Private subnet IDs
- Any account-specific values

Create cluster:

```bash
eksctl create cluster -f eksctl-config.yaml
```

To delete the cluster later:

```bash
eksctl delete cluster -f eksctl-config.yaml
```

Verify:

```bash
eksctl get cluster --region ap-south-1

aws eks list-nodegroups \
  --cluster-name devsecops-eks \
  --region ap-south-1
```

Configure kubectl:

```bash
aws eks update-kubeconfig \
  --name devsecops-eks \
  --region ap-south-1
```

Verify:

```bash
kubectl get nodes
kubectl get pods
kubectl get ns
```

---

# 19. Create Amazon ECR Repositories

Create four repositories:

```text
devsecops-frontend
devsecops-order-service
devsecops-product-service
devsecops-user-service
```

After creation, update all image repository URIs in:

- `kustomization.yaml`
- frontend deployment manifests
- user-service deployment manifests
- product-service deployment manifests
- order-service deployment manifests

Do not hard-code an old account ID.

Use:

```text
<AWS_ACCOUNT_ID>.dkr.ecr.ap-south-1.amazonaws.com/<repository>
```

Test ECR access:

```bash
aws ecr get-login-password --region ap-south-1 \
  | docker login \
  --username AWS \
  --password-stdin <AWS_ACCOUNT_ID>.dkr.ecr.ap-south-1.amazonaws.com
```

---

# 20. Create Amazon RDS MySQL

Create a DB subnet group:

```text
devsecops-subnet-group
```

Use:

```text
devsecops-data-subnet-1a
devsecops-data-subnet-1b
```

Create RDS:

```text
Identifier: devsecops-mysql
Engine: MySQL
Username: admin
Password: <RDS_PASSWORD>
Database name: devsecops_mysql
Storage: default
Subnet group: devsecops-subnet-group
Security group: devsecops-rds-sg
```

Do not expose the RDS instance publicly.

---

# 21. Test RDS Connectivity from Bastion

```bash
mysql -h <RDS_ENDPOINT> \
  -P 3306 \
  -u admin \
  -p
```

Enter the RDS password.

Create application databases:

```sql
SHOW DATABASES;

CREATE DATABASE IF NOT EXISTS userdb;
CREATE DATABASE IF NOT EXISTS productdb;
CREATE DATABASE IF NOT EXISTS orderdb;

SHOW DATABASES;

EXIT;
```

---

# 22. Copy SSH Key to Bastion

From the Windows local machine:

```bash
scp -i demo.pem demo.pem \
  ec2-user@<BASTION_PUBLIC_IP>:/home/ec2-user/
```

Connect to Bastion:

```bash
ssh -i demo.pem ec2-user@<BASTION_PUBLIC_IP>
```

Then:

```bash
chmod 400 demo.pem
```

Use the Bastion to SSH into Jenkins:

```bash
ssh -i demo.pem ec2-user@<JENKINS_PRIVATE_IP>
```

---

# 23. Configure Jenkins Server

Become root:

```bash
sudo su -
```

Set hostname:

```bash
hostnamectl set-hostname Jenkins
```

---

# 24. Install Jenkins Dependencies

Update packages:

```bash
dnf update -y
```

Install Git and Docker:

```bash
dnf install -y git docker

git --version
docker version
```

Enable Docker:

```bash
systemctl enable docker
systemctl start docker
systemctl status docker
```

---

# 25. Install Java 21

```bash
dnf install -y java-21-amazon-corretto-devel

java -version
javac -version
```

Configure Java:

```bash
tee /etc/profile.d/java.sh > /dev/null <<'EOF'
export JAVA_HOME=/usr/lib/jvm/java-21-amazon-corretto.x86_64
export PATH=$JAVA_HOME/bin:$PATH
EOF
```

Set permissions:

```bash
chmod 644 /etc/profile.d/java.sh

source /etc/profile.d/java.sh
```

Verify:

```bash
echo $JAVA_HOME
java -version
```

---

# 26. Install Maven

```bash
dnf install -y maven

mvn -version
```

---

# 27. Install Jenkins

Add repository:

```bash
sudo wget -O /etc/yum.repos.d/jenkins.repo \
  https://pkg.jenkins.io/rpm-stable/jenkins.repo
```

Import key:

```bash
sudo rpm --import \
  https://pkg.jenkins.io/redhat-stable/jenkins.io-2023.key
```

Install:

```bash
sudo dnf install -y jenkins

rpm -q jenkins
```

Enable and start:

```bash
sudo systemctl enable jenkins
sudo systemctl start jenkins
sudo systemctl status jenkins
```

Troubleshooting:

```bash
sudo journalctl -u jenkins -n 100 --no-pager
sudo ss -lntp | grep 8080
```

---

# 28. Allow Jenkins to Use Docker

```bash
sudo usermod -aG docker jenkins
```

Restart Jenkins after changing group membership.

---

# 29. Configure Jenkins Java Environment

```bash
systemctl edit jenkins
```

Add:

```ini
[Service]
Environment="JAVA_HOME=/usr/lib/jvm/java-21-amazon-corretto.x86_64"
Environment="PATH=/usr/lib/jvm/java-21-amazon-corretto.x86_64/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin"
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl restart jenkins
```

Verify:

```bash
sudo systemctl status jenkins
```

---

# 30. Prepare Trivy Directories

```bash
mkdir -p /var/lib/trivy /var/lib/trivy-tmp

chown -R jenkins:jenkins /var/lib/trivy /var/lib/trivy-tmp

chmod 755 /var/lib/trivy /var/lib/trivy-tmp

ls -ld /var/lib/trivy /var/lib/trivy-tmp
```

---

# 31. Install SonarQube

Create persistent Docker volumes:

```bash
docker volume create sonarqube_data
docker volume create sonarqube_extensions
docker volume create sonarqube_logs
```

Run SonarQube:

```bash
docker run -d \
  --name sonarqube \
  --restart unless-stopped \
  -p 9000:9000 \
  -v sonarqube_data:/opt/sonarqube/data \
  -v sonarqube_extensions:/opt/sonarqube/extensions \
  -v sonarqube_logs:/opt/sonarqube/logs \
  sonarqube:lts-community
```

Verify:

```bash
docker ps

curl http://localhost:9000/api/system/status
```

---

# 32. Access Jenkins and SonarQube from Windows

Because Jenkins is private, use the Bastion as the SSH tunnel endpoint.

From Windows:

```bash
ssh -i demo.pem \
  -L 8080:<JENKINS_PRIVATE_IP>:8080 \
  -L 9000:<JENKINS_PRIVATE_IP>:9000 \
  ec2-user@<BASTION_PUBLIC_IP>
```

Keep this terminal open.

Then open:

```text
http://localhost:8080
http://localhost:9000
```

---

# 33. Initialize Jenkins

On Jenkins server:

```bash
cat /var/lib/jenkins/secrets/initialAdminPassword
```

Use that password for the initial Jenkins setup.

Create a Jenkins administrator username and password.

---

# 34. Configure SonarQube

Initial login:

```text
Username: admin
Password: admin
```

Immediately change the default password.

Create a SonarQube token:

```text
Administration
  -> Security
  -> Users
  -> Generate Token
```

Use a name such as:

```text
jenkins-token
```

Store the token securely.

---

# 35. Configure SonarQube Webhook

In SonarQube:

```text
Administration
  -> Configuration
  -> Webhooks
```

Create:

```text
Name: jenkins-webhook
URL: http://<JENKINS_PRIVATE_IP>:8080/sonarqube-webhook/
```

The webhook lets SonarQube notify Jenkins when analysis is complete.

---

# 36. Install Jenkins Plugins

Install:

- Pipeline: Stage View
- Maven Integration
- SonarQube Scanner

Install any additional plugin required by the Jenkinsfile, especially:

- Git
- Credentials Binding
- Pipeline
- Docker Pipeline, if used by the Jenkinsfile

---

# 37. Configure GitHub SSH Access for Jenkins

Switch to the Jenkins user:

```bash
sudo usermod -s /bin/bash jenkins

sudo -iu jenkins
```

Generate an SSH key:

```bash
ssh-keygen -t ed25519 -C "jenkins-devsecops"
```

Show public key:

```bash
cat ~/.ssh/id_ed25519.pub
```

Add the public key to the GitHub repository:

```text
Repository
  -> Settings
  -> Deploy keys
  -> Add deploy key
```

Use the private key in Jenkins credentials.

---

# 38. Add GitHub Credential to Jenkins

In Jenkins:

```text
Manage Jenkins
  -> Credentials
  -> Global credentials
```

Create:

```text
Type: SSH Username with private key
ID: github-ssh
Username: <GITHUB_USERNAME>
Private Key: contents of ~/.ssh/id_ed25519
```

Also create a Secret Text credential:

```text
ID: SonarQube
Secret: <SONARQUBE_TOKEN>
```

---

# 39. Configure Jenkins Tools

Go to:

```text
Manage Jenkins
  -> Tools
```

Configure:

- Maven
- SonarQube Scanner

Default automatic installation can be used if appropriate for the environment.

---

# 40. Configure SonarQube in Jenkins

Go to:

```text
Manage Jenkins
  -> System
  -> SonarQube servers
```

Add:

```text
Name: SonarQube
Server URL: http://localhost:9000
Authentication Token: <SONARQUBE_JENKINS_CREDENTIAL>
```

Because SonarQube runs on the same Jenkins EC2 instance, `localhost:9000` is correct from Jenkins itself.

---

# 41. Install Trivy

On Jenkins server as root:

```bash
cat > /etc/yum.repos.d/trivy.repo <<'EOF'
[trivy]
name=Trivy repository
baseurl=https://aquasecurity.github.io/trivy-repo/rpm/releases/$basearch/
gpgcheck=1
enabled=1
gpgkey=https://aquasecurity.github.io/trivy-repo/rpm/public.key
EOF
```

Install:

```bash
dnf clean all
dnf install -y trivy

trivy --version
```

---

# 42. Install Gitleaks

```bash
cd /tmp

curl -LO \
  https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_x64.tar.gz

ls -lh /tmp/gitleaks_8.30.1_linux_x64.tar.gz

tar -xzf /tmp/gitleaks_8.30.1_linux_x64.tar.gz -C /tmp

sudo install -m 0755 /tmp/gitleaks /usr/local/bin/gitleaks

gitleaks version
```

Test:

```bash
cd /opt/devsecops-project

gitleaks detect --source . --no-banner --verbose
```

If secrets are found, fix them before continuing.

---

# 43. Enable EKS IAM OIDC

From Bastion:

```bash
cd /opt/devsecops-project
```

Run:

```bash
eksctl utils associate-iam-oidc-provider \
  --region ap-south-1 \
  --cluster devsecops-eks \
  --approve
```

This is required for IAM integration with Kubernetes workloads.

---

# 44. Install Cluster Autoscaler

Create the IAM policy:

```bash
aws iam create-policy \
  --policy-name AmazonEKSClusterAutoscalerPolicy \
  --policy-document file://cluster-autoscaler-policy.json
```

Create the Kubernetes service account:

```bash
eksctl create iamserviceaccount \
  --cluster devsecops-eks \
  --region ap-south-1 \
  --namespace kube-system \
  --name cluster-autoscaler \
  --attach-policy-arn arn:aws:iam::<AWS_ACCOUNT_ID>:policy/AmazonEKSClusterAutoscalerPolicy \
  --override-existing-serviceaccounts \
  --approve
```

Verify:

```bash
eksctl get iamserviceaccount --cluster devsecops-eks
```

Deploy Cluster Autoscaler:

```bash
kubectl apply -f \
https://raw.githubusercontent.com/kubernetes/autoscaler/cluster-autoscaler-release-1.34/cluster-autoscaler/cloudprovider/aws/examples/cluster-autoscaler-autodiscover.yaml
```

Verify:

```bash
kubectl get deployment cluster-autoscaler -n kube-system
```

Save the original deployment:

```bash
kubectl get deployment cluster-autoscaler \
  -n kube-system \
  -o yaml > /tmp/cluster-autoscaler-before.yaml
```

Edit:

```bash
kubectl edit deployment cluster-autoscaler -n kube-system
```

Replace the cluster placeholder with:

```text
devsecops-eks
```

Check rollout:

```bash
kubectl rollout status deployment/cluster-autoscaler -n kube-system
```

Inspect the command:

```bash
kubectl get deployment cluster-autoscaler \
  -n kube-system \
  -o jsonpath='{.spec.template.spec.containers[0].command}' | jq
```

---

# 45. Install Kubernetes Gateway API

```bash
kubectl apply -f \
https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.4.0/standard-install.yaml
```

Verify:

```bash
kubectl get crd | grep gateway.networking.k8s.io

kubectl get gatewayclass
```

---

# 46. Install AWS Load Balancer Controller

Download IAM policy:

```bash
curl -O \
https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/v2.14.1/docs/install/iam_policy.json
```

Verify:

```bash
ls -lh iam_policy.json
```

Create policy:

```bash
aws iam create-policy \
  --policy-name AWSLoadBalancerControllerIAMPolicy \
  --policy-document file://iam_policy.json
```

Verify:

```bash
aws iam get-policy \
  --policy-arn arn:aws:iam::<AWS_ACCOUNT_ID>:policy/AWSLoadBalancerControllerIAMPolicy
```

---

# 47. Create ALB Controller Service Account

```bash
eksctl create iamserviceaccount \
  --cluster devsecops-eks \
  --namespace kube-system \
  --name aws-load-balancer-controller \
  --attach-policy-arn arn:aws:iam::<AWS_ACCOUNT_ID>:policy/AWSLoadBalancerControllerIAMPolicy \
  --override-existing-serviceaccounts \
  --region ap-south-1 \
  --approve
```

Verify:

```bash
kubectl get serviceaccount \
  aws-load-balancer-controller \
  -n kube-system

kubectl describe serviceaccount \
  aws-load-balancer-controller \
  -n kube-system
```

---

# 48. Install Helm

```bash
curl -fsSL -o get_helm.sh \
  https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3

chmod 700 get_helm.sh

./get_helm.sh

helm version
```

Add EKS chart repository:

```bash
helm repo add eks https://aws.github.io/eks-charts
helm repo update

helm search repo eks/aws-load-balancer-controller
```

Install ALB Controller with Gateway API support:

```bash
helm install aws-load-balancer-controller \
  eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=devsecops-eks \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller \
  --set controllerConfig.featureGates.ALBGatewayAPI=true \
  --version 1.14.0
```

### Why `ALBGatewayAPI=true` matters

The project uses Kubernetes Gateway API.

Without enabling the Gateway API feature gate, the controller is not configured to use the Gateway API functionality required by this design.

Verify:

```bash
kubectl get pods -n kube-system | grep aws-load-balancer

kubectl get deployment \
  aws-load-balancer-controller \
  -n kube-system
```

Check logs:

```bash
kubectl logs \
  -n kube-system \
  deployment/aws-load-balancer-controller \
  --tail=50
```

---

# 49. Configure Route 53 and ACM

Create a Route 53 hosted zone for your domain.

Example:

```text
<YOUR_DOMAIN>
```

Update the domain registrar's nameservers with the nameservers provided by Route 53.

Then create an ACM certificate covering:

```text
*.<YOUR_DOMAIN>
```

Also include the root domain if required by the application.

Complete DNS validation.

Copy the ACM certificate ARN:

```text
<ACM_CERTIFICATE_ARN>
```

---

# 50. Configure Application Load Balancer Manifest

Edit:

```bash
vi /opt/devsecops-project/k8s/loadbalancer-config.yaml
```

Update the ACM certificate ARN.

**Do not manually apply this manifest if Argo CD is managing the `k8s` directory.**

Argo CD should deploy it from Git.

---

# 51. Install Argo CD

Create namespace:

```bash
kubectl create namespace argocd
```

Install:

```bash
kubectl apply -n argocd \
  --server-side \
  --force-conflicts \
  -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
```

Verify:

```bash
kubectl get pods -n argocd
kubectl get svc -n argocd
```

Retrieve initial admin password:

```bash
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath='{.data.password}' | base64 -d

echo
```

---

# 52. Access Argo CD from Bastion

On Bastion:

```bash
kubectl port-forward svc/argocd-server \
  -n argocd \
  8080:443 \
  --address=0.0.0.0
```

Keep this terminal open.

Install Argo CD CLI:

```bash
curl -sSL -o /usr/local/bin/argocd \
  https://github.com/argoproj/argo-cd/releases/latest/download/argocd-linux-amd64

chmod +x /usr/local/bin/argocd

argocd version --client
```

Login:

```bash
argocd login localhost:8080 \
  --username admin \
  --password '<ARGOCD_PASSWORD>' \
  --insecure
```

Verify:

```bash
argocd account get-user-info
```

`argocd cluster add` is only required if Argo CD needs to manage another Kubernetes cluster. It is not necessary for the standard in-cluster deployment described here.

---

# 53. Add GitHub Repository to Argo CD

Create an SSH key on Bastion:

```bash
ssh-keygen -t ed25519 -C "argocd-devsecops"
```

Show public key:

```bash
cat ~/.ssh/id_ed25519.pub
```

Add the public key to GitHub:

```text
Repository
  -> Settings
  -> Deploy keys
```

Use the private key when configuring the repository in Argo CD.

In Argo CD UI:

```text
Settings
  -> Repositories
  -> Connect Repository
```

Configure the SSH Git repository:

```text
Repository URL: <GITHUB_SSH_REPOSITORY_URL>
Private Key: <ARG0CD_PRIVATE_KEY>
```

---

# 54. Create the Argo CD Application

Create:

```text
Application name: devsecops-app
Repository: <GITHUB_REPOSITORY>
Path: k8s
Destination namespace: devsecops
```

The `k8s` directory becomes the GitOps source of truth.

Argo CD continuously compares Git with the cluster and synchronizes the desired state.

---

# 55. Create Application Namespace

Before Jenkins/Argo CD deploys application resources:

```bash
kubectl create namespace devsecops
```

Verify:

```bash
kubectl get namespace devsecops
```

---

# 56. Configure RDS Kubernetes Secret

Create the application secret:

```bash
kubectl create secret generic devsecops-secrets \
  -n devsecops \
  --from-literal=DB_HOST='<RDS_ENDPOINT>' \
  --from-literal=DB_PORT='3306' \
  --from-literal=DB_USERNAME='admin' \
  --from-literal=DB_PASSWORD='<RDS_PASSWORD>' \
  --from-literal=JWT_SECRET='<JWT_SECRET>' \
  --from-literal=JWT_EXPIRATION='3600000'
```

Verify:

```bash
kubectl get secret devsecops-secrets -n devsecops
```

**Important:** Kubernetes Secrets are not a substitute for proper secret management in production. For a production implementation, consider AWS Secrets Manager + External Secrets.

---

# 57. Configure RDS Access from EKS

Get the EKS cluster security group:

```bash
aws eks describe-cluster \
  --name devsecops-eks \
  --query 'cluster.resourcesVpcConfig.clusterSecurityGroupId' \
  --output text
```

Allow that security group in:

```text
devsecops-rds-sg
```

Port:

```text
3306
```

Find the security groups attached to a node if required:

```bash
aws ec2 describe-instances \
  --filters "Name=private-dns-name,Values=<PRIVATE_NODE_DNS>" \
  --query 'Reservations[].Instances[].SecurityGroups[*].[GroupId,GroupName]' \
  --output table
```

Also inspect RDS security groups:

```bash
aws rds describe-db-instances \
  --db-instance-identifier devsecops-mysql \
  --query 'DBInstances[0].VpcSecurityGroups[*].VpcSecurityGroupId' \
  --output text
```

The important requirement is:

```text
EKS workload/node security group
          |
          | TCP 3306
          v
devsecops-rds-sg
          |
          v
RDS MySQL
```

---

# 58. Verify Application Pods

```bash
kubectl get pods -n devsecops
```

At this stage the services may be deployed by Argo CD.

---

# 59. First-Time GitHub Host Verification from Jenkins

Connect to Jenkins as the Jenkins user:

```bash
sudo -iu jenkins
```

Clone once:

```bash
git clone git@github.com:<GITHUB_OWNER>/<GITHUB_REPOSITORY>.git
```

The purpose of this step is to establish GitHub's SSH host key in the Jenkins user's SSH configuration.

---

# 60. Install Argo Rollouts

Run from Bastion.

Create namespace:

```bash
kubectl create namespace argo-rollouts
```

Install:

```bash
kubectl apply -n argo-rollouts \
  -f https://github.com/argoproj/argo-rollouts/releases/latest/download/install.yaml
```

Verify:

```bash
kubectl get pods -n argo-rollouts
kubectl get deployment -n argo-rollouts

kubectl logs \
  -n argo-rollouts \
  deploy/argo-rollouts \
  --tail=30
```

---

# 61. Install Argo Rollouts kubectl Plugin

```bash
curl -LO \
  https://github.com/argoproj/argo-rollouts/releases/latest/download/kubectl-argo-rollouts-linux-amd64

chmod +x kubectl-argo-rollouts-linux-amd64

mv kubectl-argo-rollouts-linux-amd64 \
  /usr/local/bin/kubectl-argo-rollouts
```

Verify:

```bash
kubectl argo rollouts version
```

---

# 62. Verify Argo CD and Rollouts

```bash
kubectl get applications -A

kubectl get application <APP_NAME> -n argocd
```

Check a rollout:

```bash
kubectl get rollout user-service -n devsecops

kubectl argo rollouts get rollout \
  user-service \
  -n devsecops
```

Check ReplicaSets:

```bash
kubectl get rs -n devsecops
```

Check services:

```bash
kubectl get svc \
  user-service \
  user-service-preview \
  -n devsecops
```

Check endpoints:

```bash
kubectl get endpoints \
  user-service \
  user-service-preview \
  -n devsecops
```

Check rollout status:

```bash
kubectl argo rollouts status \
  user-service \
  -n devsecops
```

Watch:

```bash
kubectl argo rollouts get rollout \
  user-service \
  -n devsecops \
  --watch
```

---

# 63. Create Jenkins Pipeline

In Jenkins:

```text
New Item
  -> Pipeline
```

Use:

```text
Name: devsecops-app
```

Select:

```text
Pipeline script from SCM
```

SCM:

```text
Git
```

Repository:

```text
<GITHUB_SSH_REPOSITORY_URL>
```

Credentials:

```text
github-ssh
```

Jenkinsfile:

```text
jenkins-arcgocd-kustomization/Jenkinsfile
```

Save and trigger a build.

The Jenkinsfile should perform the CI stages defined by the project, such as:

```text
Checkout
   |
Build/Test
   |
Gitleaks
   |
SonarQube
   |
Trivy
   |
Docker Build
   |
ECR Push
   |
Update deployment image
   |
Git commit/push
   |
Argo CD detects Git change
   |
Argo Rollouts performs deployment
```

---

# 64. Check Rollout Revisions

When required:

```bash
kubectl argo rollouts get rollout user-service -n devsecops

kubectl argo rollouts get rollout product-service -n devsecops

kubectl argo rollouts get rollout order-service -n devsecops
```

---

# 65. Prometheus and Alertmanager Setup

Create monitoring namespace:

```bash
kubectl create namespace monitoring

kubectl get namespace monitoring
```

Add repository:

```bash
helm repo add prometheus-community \
  https://prometheus-community.github.io/helm-charts

helm repo update

helm search repo prometheus-community/kube-prometheus-stack
```

---

# 66. Gmail App Password for Alertmanager

Create a Gmail App Password from the Google account used for alert notifications.

Do not store the App Password in Git.

Create the Kubernetes secret:

```bash
kubectl create secret generic alertmanager-gmail \
  -n monitoring \
  --from-literal=smtp-auth-password='<GMAIL_APP_PASSWORD>'
```

Verify the key exists:

```bash
kubectl get secret alertmanager-gmail \
  -n monitoring \
  -o jsonpath='{.data}' | jq 'keys'
```

Check the decoded secret length without displaying the password:

```bash
kubectl get secret alertmanager-gmail \
  -n monitoring \
  -o jsonpath='{.data.smtp-auth-password}' \
  | base64 -d | wc -c
```

---

# 67. Prometheus Helm Values

Create:

```bash
vi k8s/monitoring/values.yaml
```

Use:

```yaml
alertmanager:
  enabled: true

  config:
    global:
      resolve_timeout: 5m
      smtp_smarthost: 'smtp.gmail.com:587'
      smtp_from: '<YOUR_GMAIL>@gmail.com'
      smtp_auth_username: '<YOUR_GMAIL>@gmail.com'
      smtp_auth_password_file: '/etc/alertmanager/secrets/alertmanager-gmail/smtp-auth-password'
      smtp_require_tls: true

    route:
      group_by:
        - alertname
        - namespace
        - severity
      group_wait: 30s
      group_interval: 5m
      repeat_interval: 12h
      receiver: 'devsecops-gmail'

      routes:
        - receiver: 'null'
          matchers:
            - 'alertname = "Watchdog"'

    receivers:
      - name: 'devsecops-gmail'
        email_configs:
          - to: '<YOUR_GMAIL>@gmail.com'
            send_resolved: true

      - name: 'null'

  alertmanagerSpec:
    replicas: 1
    secrets:
      - alertmanager-gmail

grafana:
  enabled: true

  additionalDataSources:
    - name: Loki
      type: loki
      uid: loki
      url: http://loki-gateway.loki.svc.cluster.local
      access: proxy
      isDefault: false

    - name: Tempo
      type: tempo
      uid: tempo
      url: http://tempo.tempo.svc.cluster.local:3200
      access: proxy
      isDefault: false

prometheus:
  enabled: true
```

**Note:** Loki and Tempo must eventually exist at the service addresses configured above. If monitoring is installed before Loki/Tempo, Grafana may initially show datasource connection failures until those services are available.

---

# 68. Validate Prometheus Helm Template

Before installation:

```bash
helm template monitoring \
  prometheus-community/kube-prometheus-stack \
  -n monitoring \
  -f k8s/monitoring/values.yaml \
  > /tmp/monitoring-rendered.yaml
```

Inspect Alertmanager secret configuration:

```bash
grep -n -A20 -B5 \
  'alertmanager-monitoring-kube-prometheus-alertmanager' \
  /tmp/monitoring-rendered.yaml
```

Inspect SMTP configuration:

```bash
grep -n \
  'smtp_auth_password_file\|smtp_smarthost\|smtp_auth_username' \
  /tmp/monitoring-rendered.yaml
```

Install:

```bash
helm install monitoring \
  prometheus-community/kube-prometheus-stack \
  -n monitoring \
  -f k8s/monitoring/values.yaml
```

Verify:

```bash
kubectl get pods -n monitoring
kubectl get prometheus -n monitoring
kubectl get alertmanager -n monitoring
```

---

# 69. Verify Alertmanager Gmail Secret

```bash
kubectl exec -n monitoring \
  alertmanager-monitoring-kube-prometheus-alertmanager-0 \
  -- ls -l /etc/alertmanager/secrets/alertmanager-gmail/
```

Check the file without printing its contents:

```bash
kubectl exec -n monitoring \
  alertmanager-monitoring-kube-prometheus-alertmanager-0 \
  -- sh -c \
  'test -s /etc/alertmanager/secrets/alertmanager-gmail/smtp-auth-password && echo "GMAIL SECRET OK" || echo "GMAIL SECRET MISSING"'
```

Inspect Alertmanager configuration:

```bash
kubectl exec -n monitoring \
  alertmanager-monitoring-kube-prometheus-alertmanager-0 \
  -- cat /etc/alertmanager/config_out/alertmanager.env.yaml
```

Check logs:

```bash
kubectl logs -n monitoring \
  alertmanager-monitoring-kube-prometheus-alertmanager-0 \
  -c alertmanager \
  --tail=100
```

---

# 70. Test Gmail Alerting

Create a temporary Prometheus alert:

```bash
kubectl apply -n monitoring -f - <<'EOF'
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: gmail-test-alert
  labels:
    release: monitoring
spec:
  groups:
  - name: gmail-test
    rules:
    - alert: GmailTestAlert
      expr: vector(1)
      for: 30s
      labels:
        severity: critical
      annotations:
        summary: "DevSecOps Gmail Alert Test"
        description: "This is a temporary test alert for Alertmanager Gmail notification."
EOF
```

Verify:

```bash
kubectl get prometheusrule -n monitoring
```

After testing:

```bash
kubectl delete prometheusrule gmail-test-alert -n monitoring
```

Verify cleanup:

```bash
kubectl get prometheusrule -n monitoring
```

General monitoring verification:

```bash
helm list -n monitoring
kubectl get pods -n monitoring
kubectl get prometheus -n monitoring
kubectl get alertmanager -n monitoring
kubectl get servicemonitor -n monitoring
kubectl get prometheusrule -n monitoring
```

---

# 71. Add Grafana and Loki Helm Repositories

```bash
helm repo add grafana-community \
  https://grafana-community.github.io/helm-charts

helm repo add grafana \
  https://grafana.github.io/helm-charts

helm repo update

helm repo list
```

---

# 72. Create S3 Bucket for Loki

Create:

```bash
aws s3api create-bucket \
  --bucket devsecops-loki-ap-south-1-<AWS_ACCOUNT_ID> \
  --region ap-south-1 \
  --create-bucket-configuration LocationConstraint=ap-south-1
```

Enable versioning:

```bash
aws s3api put-bucket-versioning \
  --bucket devsecops-loki-ap-south-1-<AWS_ACCOUNT_ID> \
  --versioning-configuration Status=Enabled
```

Block public access:

```bash
aws s3api put-public-access-block \
  --bucket devsecops-loki-ap-south-1-<AWS_ACCOUNT_ID> \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

Verify:

```bash
aws s3api get-bucket-location \
  --bucket devsecops-loki-ap-south-1-<AWS_ACCOUNT_ID>

aws s3api get-public-access-block \
  --bucket devsecops-loki-ap-south-1-<AWS_ACCOUNT_ID>
```

---

# 73. Create Loki IAM Policy and Role

Edit:

```bash
vi /opt/devsecops-project/loki-s3-policy.json
```

Replace the account/bucket-specific values.

Create policy:

```bash
aws iam create-policy \
  --policy-name DevSecOpsLokiS3Policy \
  --policy-document file:///opt/devsecops-project/loki-s3-policy.json
```

Verify:

```bash
aws iam get-policy \
  --policy-arn arn:aws:iam::<AWS_ACCOUNT_ID>:policy/DevSecOpsLokiS3Policy
```

Create role:

```bash
aws iam create-role \
  --role-name DevSecOpsLokiRole \
  --assume-role-policy-document file:///opt/devsecops-project/loki-pod-identity-trust.json
```

Attach policy:

```bash
aws iam attach-role-policy \
  --role-name DevSecOpsLokiRole \
  --policy-arn arn:aws:iam::<AWS_ACCOUNT_ID>:policy/DevSecOpsLokiS3Policy
```

Verify:

```bash
aws iam list-attached-role-policies \
  --role-name DevSecOpsLokiRole

aws iam get-role \
  --role-name DevSecOpsLokiRole \
  --query 'Role.Arn' \
  --output text
```

---

# 74. Configure EKS Pod Identity for Loki

Create namespace:

```bash
kubectl create namespace loki
```

Create Pod Identity association:

```bash
aws eks create-pod-identity-association \
  --cluster-name devsecops-eks \
  --namespace loki \
  --service-account loki \
  --role-arn arn:aws:iam::<AWS_ACCOUNT_ID>:role/DevSecOpsLokiRole \
  --region ap-south-1
```

List associations:

```bash
aws eks list-pod-identity-associations \
  --cluster-name devsecops-eks \
  --region ap-south-1
```

Describe an association:

```bash
aws eks describe-pod-identity-association \
  --cluster-name devsecops-eks \
  --association-id <ASSOCIATION_ID> \
  --region ap-south-1
```

Readable output:

```bash
aws eks describe-pod-identity-association \
  --cluster-name devsecops-eks \
  --association-id <ASSOCIATION_ID> \
  --region ap-south-1 \
  --query 'association.{Namespace:namespace,ServiceAccount:serviceAccount,Role:roleArn}' \
  --output table
```

Check the EKS Pod Identity Agent:

```bash
aws eks describe-addon \
  --cluster-name devsecops-eks \
  --addon-name eks-pod-identity-agent \
  --region ap-south-1
```

If it is not installed:

```bash
aws eks create-addon \
  --cluster-name devsecops-eks \
  --addon-name eks-pod-identity-agent \
  --region ap-south-1
```

Verify:

```bash
kubectl get pods -n kube-system
```

---

# 75. Install Loki

Edit:

```bash
vi /opt/devsecops-project/k8s/monitoring/loki/values.yaml
```

Update:

```text
<AWS_ACCOUNT_ID>
```

Install:

```bash
helm install loki \
  grafana-community/loki \
  --version 18.11.0 \
  --namespace loki \
  -f k8s/monitoring/loki/values.yaml
```

Verify:

```bash
kubectl get pods -n loki
kubectl get svc -n loki
```

The expected Loki gateway address used by Grafana is:

```text
http://loki-gateway.loki.svc.cluster.local
```

---

# 76. Configure EBS CSI Driver

Edit:

```bash
vi /opt/devsecops-project/ebs-csi-trust.json
```

Update the AWS OIDC-related values for this cluster.

Create IAM role:

```bash
aws iam create-role \
  --role-name DevSecOpsEBSCSIRole \
  --assume-role-policy-document file:///opt/devsecops-project/ebs-csi-trust.json
```

Attach policy:

```bash
aws iam attach-role-policy \
  --role-name DevSecOpsEBSCSIRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy
```

Create EKS addon:

```bash
aws eks create-addon \
  --cluster-name devsecops-eks \
  --addon-name aws-ebs-csi-driver \
  --addon-version v1.64.0-eksbuild.1 \
  --service-account-role-arn arn:aws:iam::<AWS_ACCOUNT_ID>:role/DevSecOpsEBSCSIRole \
  --region ap-south-1
```

Check status:

```bash
aws eks describe-addon \
  --cluster-name devsecops-eks \
  --addon-name aws-ebs-csi-driver \
  --region ap-south-1 \
  --query 'addon.{Status:status,Version:addonVersion,Health:health}'
```

Create GP3 StorageClass:

```bash
kubectl apply -f k8s/storage/gp3-storageclass.yaml
```

Verify:

```bash
kubectl get storageclass
```

---

# 77. Grafana Alloy

Add Grafana repository if not already present:

```bash
helm repo add grafana \
  https://grafana.github.io/helm-charts

helm repo update

helm search repo grafana/alloy --versions | head -20
```

The project deploys Alloy through Argo CD.

Apply the Alloy Argo CD application:

```bash
kubectl apply -f k8s/monitoring/alloy/application.yaml
```

Verify:

```bash
kubectl get application alloy -n argocd

kubectl get pods -n alloy

kubectl get pods -n alloy -o wide

kubectl get daemonset -n alloy
```

Check logs:

```bash
kubectl logs \
  -n alloy \
  -l app.kubernetes.io/name=alloy \
  --tail=50
```

Inspect labels:

```bash
kubectl get pods -n alloy --show-labels
```

Alloy's responsibility in this architecture is to collect Kubernetes/application logs and forward them to Loki.

---

# 78. Tempo Object Storage

Create S3 bucket:

```bash
aws s3api create-bucket \
  --bucket devsecops-tempo-ap-south-1-<AWS_ACCOUNT_ID> \
  --region ap-south-1 \
  --create-bucket-configuration LocationConstraint=ap-south-1
```

Enable server-side encryption:

```bash
aws s3api put-bucket-encryption \
  --bucket devsecops-tempo-ap-south-1-<AWS_ACCOUNT_ID> \
  --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
```

Verify:

```bash
aws s3api head-bucket \
  --bucket devsecops-tempo-ap-south-1-<AWS_ACCOUNT_ID>
```

---

# 79. Tempo IAM Policy

Create policy:

```bash
aws iam create-policy \
  --policy-name devsecops-tempo-s3-policy \
  --policy-document file://tempo-s3-policy.json
```

Verify:

```bash
aws iam get-policy \
  --policy-arn arn:aws:iam::<AWS_ACCOUNT_ID>:policy/devsecops-tempo-s3-policy
```

---

# 80. Tempo IAM Role

Edit:

```bash
vi /opt/devsecops/tempo-pod-identity-trust.json
```

Update account-specific values.

Create role:

```bash
aws iam create-role \
  --role-name devsecops-tempo-s3-role \
  --assume-role-policy-document file://tempo-pod-identity-trust.json
```

Attach policy:

```bash
aws iam attach-role-policy \
  --role-name devsecops-tempo-s3-role \
  --policy-arn arn:aws:iam::<AWS_ACCOUNT_ID>:policy/devsecops-tempo-s3-policy
```

Verify:

```bash
aws iam list-attached-role-policies \
  --role-name devsecops-tempo-s3-role
```

---

# 81. Tempo EKS Pod Identity

Create association:

```bash
aws eks create-pod-identity-association \
  --cluster-name devsecops-eks \
  --namespace tempo \
  --service-account tempo \
  --role-arn arn:aws:iam::<AWS_ACCOUNT_ID>:role/devsecops-tempo-s3-role \
  --region ap-south-1
```

Verify:

```bash
aws eks list-pod-identity-associations \
  --cluster-name devsecops-eks \
  --output table
```

---

# 82. Configure Tempo

Edit:

```bash
vi /opt/devsecops-project/k8s/monitoring/tempo/values.yaml
```

Update:

```text
<AWS_ACCOUNT_ID>
```

Deploy through Argo CD:

```bash
kubectl apply -f k8s/monitoring/tempo/application.yaml
```

Verify Argo application:

```bash
kubectl get application tempo -n argocd
```

Verify Tempo:

```bash
kubectl get pods -n tempo
kubectl get pvc -n tempo
```

Check logs:

```bash
kubectl logs -n tempo tempo-0 --tail=100
```

Confirm S3 backend:

```bash
kubectl exec -n tempo tempo-0 -- \
  sh -c 'grep -n -A15 -B5 "backend: s3" /conf/tempo.yaml'
```

---

# 83. Verify OpenTelemetry Configuration

Check application pods:

```bash
kubectl get pods -n devsecops
```

Inspect running processes:

```bash
kubectl exec -n devsecops deploy/user-service -- ps aux

kubectl exec -n devsecops deploy/product-service -- ps aux

kubectl exec -n devsecops deploy/order-service -- ps aux
```

Check OTEL environment variables:

```bash
kubectl exec -n devsecops deploy/user-service -- env | grep OTEL

kubectl exec -n devsecops deploy/product-service -- env | grep OTEL

kubectl exec -n devsecops deploy/order-service -- env | grep OTEL
```

Expected architecture:

```text
Java Microservice
      |
      | OpenTelemetry
      v
OTEL Collector / Alloy
      |
      v
Tempo
      |
      v
S3
```

---

# 84. UI Port Forwarding from Bastion

Run each command in a separate Bastion terminal and keep the processes running.

## Prometheus

```bash
kubectl port-forward \
  -n monitoring \
  svc/monitoring-kube-prometheus-prometheus \
  9090:9090 \
  --address=0.0.0.0
```

## Argo CD

```bash
kubectl port-forward \
  svc/argocd-server \
  -n argocd \
  8080:443 \
  --address=0.0.0.0
```

## Grafana

```bash
kubectl port-forward \
  -n monitoring \
  svc/monitoring-grafana \
  3000:80 \
  --address=0.0.0.0
```

---

# 85. Access the UI Through Bastion

If the Bastion security group permits these ports from your IP:

```text
https://<BASTION_PUBLIC_IP>:8080     Argo CD
http://<BASTION_PUBLIC_IP>:3000      Grafana
http://<BASTION_PUBLIC_IP>:9090      Prometheus
```

For stronger security, prefer SSH tunnels rather than exposing port-forward ports publicly.

---

# 86. Grafana Credentials

Get username:

```bash
kubectl -n monitoring get secret monitoring-grafana \
  -o jsonpath='{.data.admin-user}' | base64 -d

echo
```

Get password:

```bash
kubectl -n monitoring get secret monitoring-grafana \
  -o jsonpath='{.data.admin-password}' | base64 -d

echo
```

---

# 87. Grafana Dashboards

The repository contains dashboards that can be imported into Grafana.

After logging into Grafana:

1. Open **Dashboards**.
2. Choose **Import**.
3. Upload the dashboard JSON.
4. Select the correct datasource.

Use:

```text
Prometheus -> Metrics
Loki       -> Logs
Tempo      -> Traces
```

Do not create dozens of unnecessary panels.

The objective is a small set of useful dashboards.

---

# 88. Recommended DevSecOps Logs Dashboard

Dashboard name:

```text
DevSecOps — Logs
```

Required panels:

### 1. Log Volume

Type:

```text
Time series
```

Purpose:

```text
Show the number of logs over time.
```

### 2. Application Logs

Type:

```text
Logs
```

Filter:

```text
namespace="devsecops"
```

### 3. Error Logs

Type:

```text
Logs
```

Use:

```text
detected_level="error"
```

where the log pipeline provides that field.

### 4. Logs by Application

Type:

```text
Bar chart / Time series
```

Group by application label.

### 5. Logs by Namespace

Type:

```text
Bar chart
```

Group by namespace.

This is intentionally small. More panels are not automatically better.

---

# 89. Recommended DevSecOps Tracing Dashboard

Dashboard name:

```text
DevSecOps — Tracing
```

Required panels:

### 1. Request Rate

Shows the number of requests/traces over time.

### 2. Error Rate

Shows failed requests/traces.

### 3. Request Duration / Latency

Shows request performance.

### 4. Trace Search / Trace Explorer

Allows engineers to locate individual traces.

---

# 90. Configure Grafana Correlation

Grafana should have these datasources:

```text
Prometheus
Loki
Tempo
```

Recommended correlation:

```text
Metric
  |
  v
Trace
  |
  v
Logs
```

and:

```text
Log
  |
  v
Trace ID
  |
  v
Tempo
```

The objective is to move from a failed request to:

```text
Metrics
   -> Trace
      -> Application Logs
```

without manually searching multiple systems.

---

# 91. Blue/Green Deployment Validation

When a new `user-service` version is deployed through Argo Rollouts, the new version should first receive traffic through:

```text
user-service-preview
```

The stable production service remains:

```text
user-service
```

Do not promote the new version immediately.

---

# 92. Test the Preview Version

Create a temporary curl pod:

```bash
kubectl run curl-test \
  -n devsecops \
  --rm -it \
  --image=curlimages/curl \
  -- sh
```

From inside the pod:

```bash
curl -i \
  http://user-service-preview:8081/actuator/health
```

Expected result:

```text
HTTP 200
```

Test registration:

```bash
curl -i -X POST \
  http://user-service-preview:8081/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "BlueGreen",
    "email": "bluegreen@example.com",
    "password": "Test@123"
  }'
```

If the preview version works correctly, promote it.

Promotion can be performed from the Argo CD/Argo Rollouts UI or CLI according to the configured rollout strategy.

---

# 93. Useful Rollout Commands

```bash
kubectl argo rollouts status \
  user-service \
  -n devsecops
```

```bash
kubectl argo rollouts get rollout \
  user-service \
  -n devsecops
```

```bash
kubectl argo rollouts get rollout \
  user-service \
  -n devsecops \
  --watch
```

Inspect services:

```bash
kubectl get svc \
  user-service \
  user-service-preview \
  -n devsecops
```

Inspect endpoints:

```bash
kubectl get endpoints \
  user-service \
  user-service-preview \
  -n devsecops
```

---

# 94. Create a Temporary Kubernetes Network Test Pod

Run from Bastion:

```bash
kubectl run network-test \
  -n devsecops \
  --rm -it \
  --image=curlimages/curl \
  --restart=Never \
  -- sh
```

This pod is useful for testing:

- service DNS
- service ports
- HTTP health endpoints
- application-to-application connectivity
- RDS connectivity indirectly through application behavior

---

# 95. Backend Health Checks

From an appropriate test pod:

```bash
curl -i http://user-service:8081/actuator/health

curl -i http://product-service:8082/actuator/health

curl -i http://order-service:8083/actuator/health

curl -i http://product-service:8082/api/products
```

Also test the ALB endpoint if one is available:

```bash
curl -I http://<ALB_ENDPOINT>/
```

Do not permanently depend on generated ALB DNS names in documentation. ALB names can change.

---

# 96. Test User Registration

Example:

```bash
curl -v -X POST \
  http://<ALB_ENDPOINT>/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "EKS User",
    "email": "eksuser@example.com",
    "password": "Test@12345"
  }'
```

---

# 97. Test User Login

```bash
curl -v -X POST \
  http://<ALB_ENDPOINT>/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "eksuser@example.com",
    "password": "Test@12345"
  }'
```

The response should contain the authentication token.

---

# 98. Get a Token Automatically

Create a user from the application UI first.

Example:

```text
https://dev.<YOUR_DOMAIN>/login
```

Then:

```bash
TOKEN=$(curl -s -X POST \
  http://<ALB_ENDPOINT>/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email":"<USER_EMAIL>",
    "password":"<USER_PASSWORD>"
  }' | jq -r '.token')
```

Verify:

```bash
echo "$TOKEN"
```

Do not put real JWT tokens in Git or README files.

---

# 99. Create a Product

Use the token:

```bash
curl -i \
  -X POST \
  http://<ALB_ENDPOINT>/api/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "DevSecOps Laptop",
    "description": "Test product for EKS deployment",
    "price": 75000,
    "quantity": 10
  }'
```

Verify products:

```bash
curl -i \
  http://<ALB_ENDPOINT>/api/products
```

---

# 100. Create an Order

Example:

```bash
curl -v -X POST \
  http://<ALB_ENDPOINT>/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "productId": 1,
    "quantity": 2
  }'
```

---

# 101. Final Public DNS Configuration

After:

- EKS is healthy
- Argo CD is synchronized
- Argo Rollouts are healthy
- Gateway API is working
- AWS Load Balancer Controller is healthy
- ACM certificate is valid
- application is reachable

Create a Route 53 record:

```text
Name:
devsecops.<YOUR_DOMAIN>

Type:
A

Alias:
Yes

Target:
ALB endpoint
```

Then access:

```text
https://devsecops.<YOUR_DOMAIN>
```

---

# 102. Final End-to-End Application Test

Perform this sequence:

```text
1. Open HTTPS application URL
        |
        v
2. Register a user
        |
        v
3. Login
        |
        v
4. Obtain JWT
        |
        v
5. Create a product
        |
        v
6. List products
        |
        v
7. Create an order
        |
        v
8. Verify backend logs in Loki
        |
        v
9. Verify application metrics in Prometheus
        |
        v
10. Verify traces in Tempo
        |
        v
11. Verify Grafana correlation
```

---

# 103. Full Deployment Order

This is the recommended order. Do not randomly install components.

```text
PHASE 1 — AWS FOUNDATION
    |
    +-- AWS CLI
    +-- VPC
    +-- Internet Gateway
    +-- Public Subnets
    +-- Private Subnets
    +-- Data Subnets
    +-- NAT Gateway
    +-- Route Tables
    +-- Security Groups
    |
    v

PHASE 2 — EC2 ADMINISTRATION
    |
    +-- Bastion
    +-- Jenkins
    +-- Bastion tools
    +-- Jenkins tools
    |
    v

PHASE 3 — DATA AND CONTAINER REGISTRY
    |
    +-- ECR
    +-- RDS MySQL
    +-- Database creation
    |
    v

PHASE 4 — KUBERNETES
    |
    +-- EKS
    +-- kubectl
    +-- eksctl
    +-- kubeconfig
    |
    v

PHASE 5 — KUBERNETES AWS INTEGRATION
    |
    +-- OIDC
    +-- Pod Identity Agent
    +-- Cluster Autoscaler
    +-- Gateway API
    +-- AWS Load Balancer Controller
    +-- EBS CSI
    |
    v

PHASE 6 — CI/CD SECURITY
    |
    +-- Jenkins
    +-- Maven
    +-- SonarQube
    +-- Trivy
    +-- Gitleaks
    +-- GitHub SSH
    |
    v

PHASE 7 — GITOPS
    |
    +-- Argo CD
    +-- GitHub repository
    +-- devsecops namespace
    +-- RDS Kubernetes Secret
    |
    v

PHASE 8 — DEPLOYMENT STRATEGY
    |
    +-- Argo Rollouts
    +-- Stable service
    +-- Preview service
    +-- Manual promotion
    |
    v

PHASE 9 — OBSERVABILITY
    |
    +-- Prometheus
    +-- Alertmanager
    +-- Grafana
    +-- Loki
    +-- Grafana Alloy
    +-- Tempo
    |
    v

PHASE 10 — PUBLIC APPLICATION
    |
    +-- Gateway
    +-- ALB
    +-- ACM
    +-- Route 53
    +-- HTTPS
    |
    v

PHASE 11 — VALIDATION
    |
    +-- Registration
    +-- Login
    +-- Product creation
    +-- Order creation
    +-- Metrics
    +-- Logs
    +-- Traces
    +-- Blue/Green promotion
```

---

# 104. Operational Verification Checklist

## AWS

- [ ] VPC exists
- [ ] Public subnets exist in two AZs
- [ ] Private subnets exist in two AZs
- [ ] Data subnets exist in two AZs
- [ ] Internet Gateway attached
- [ ] NAT Gateway available
- [ ] Route tables are correct
- [ ] Security groups restrict access correctly

## EC2

- [ ] Bastion is reachable by SSH
- [ ] Jenkins is reachable from Bastion
- [ ] Docker is running
- [ ] Jenkins is running
- [ ] SonarQube is running

## EKS

- [ ] EKS cluster is ACTIVE
- [ ] Nodes are Ready
- [ ] kubeconfig works
- [ ] Pod Identity Agent is running
- [ ] EBS CSI is healthy
- [ ] Cluster Autoscaler is healthy
- [ ] Gateway API CRDs exist
- [ ] AWS Load Balancer Controller is healthy

## CI/CD

- [ ] Jenkins can clone GitHub
- [ ] Maven build works
- [ ] Gitleaks works
- [ ] SonarQube analysis works
- [ ] Trivy scan works
- [ ] Docker build works
- [ ] ECR login works
- [ ] Images are pushed to ECR

## GitOps

- [ ] Argo CD is healthy
- [ ] GitHub repository is connected
- [ ] `devsecops-app` exists
- [ ] Application is Synced
- [ ] Application is Healthy

## Database

- [ ] RDS is Available
- [ ] Bastion can connect to RDS
- [ ] `userdb` exists
- [ ] `productdb` exists
- [ ] `orderdb` exists
- [ ] EKS workloads can reach RDS
- [ ] RDS SG allows only required sources

## Rollouts

- [ ] Argo Rollouts controller is healthy
- [ ] `user-service` rollout exists
- [ ] Preview service exists
- [ ] Preview health check succeeds
- [ ] New version can be manually promoted
- [ ] Stable service points to promoted version

## Monitoring

- [ ] Prometheus is healthy
- [ ] Alertmanager is healthy
- [ ] Gmail test alert succeeds
- [ ] Grafana is accessible
- [ ] Loki is healthy
- [ ] Alloy pods are running
- [ ] Tempo is healthy
- [ ] Loki S3 access works
- [ ] Tempo S3 access works
- [ ] Grafana can query Prometheus
- [ ] Grafana can query Loki
- [ ] Grafana can query Tempo

## Application

- [ ] HTTPS works
- [ ] Registration works
- [ ] Login works
- [ ] Product creation works
- [ ] Product listing works
- [ ] Order creation works
- [ ] Application logs appear in Loki
- [ ] Metrics appear in Prometheus
- [ ] Traces appear in Tempo

---

# 105. Troubleshooting Guide

## Jenkins is not starting

```bash
systemctl status jenkins
journalctl -u jenkins -n 100 --no-pager
ss -lntp | grep 8080
java -version
```

Check that Java 21 is configured correctly.

---

## Docker permission problem in Jenkins

```bash
id jenkins
getent group docker
```

If Jenkins was added to the Docker group, restart Jenkins:

```bash
systemctl restart jenkins
```

---

## ECR login fails

Check:

```bash
aws sts get-caller-identity
```

Then:

```bash
aws ecr get-login-password --region ap-south-1 \
  | docker login \
  --username AWS \
  --password-stdin <AWS_ACCOUNT_ID>.dkr.ecr.ap-south-1.amazonaws.com
```

---

## EKS nodes are not Ready

Check:

```bash
kubectl get nodes
kubectl describe node <NODE_NAME>
kubectl get pods -A
```

Also inspect:

- subnet routing
- NAT Gateway
- node security groups
- IAM permissions
- EKS cluster status

---

## Application cannot connect to RDS

Check:

```bash
kubectl get secret devsecops-secrets -n devsecops
kubectl get pods -n devsecops
```

Confirm:

```text
DB_HOST
DB_PORT
DB_USERNAME
DB_PASSWORD
```

Then check RDS security group access.

Required flow:

```text
EKS workload/node SG
       |
       | TCP 3306
       v
devsecops-rds-sg
       |
       v
RDS MySQL
```

---

## Argo CD application is OutOfSync

Check:

```bash
kubectl get application devsecops-app -n argocd
```

Then inspect the Argo CD UI for:

- Git repository error
- SSH key error
- invalid YAML
- namespace error
- image pull error
- missing CRD
- invalid Kubernetes resource

---

## Rollout is stuck

```bash
kubectl argo rollouts get rollout \
  user-service \
  -n devsecops
```

Then:

```bash
kubectl describe rollout user-service -n devsecops
kubectl get pods -n devsecops
kubectl get rs -n devsecops
kubectl get endpoints -n devsecops
```

Test preview:

```bash
kubectl run curl-test \
  -n devsecops \
  --rm -it \
  --image=curlimages/curl \
  -- sh
```

Then:

```bash
curl -i http://user-service-preview:8081/actuator/health
```

---

## Loki receives no logs

Check Alloy:

```bash
kubectl get pods -n alloy

kubectl logs \
  -n alloy \
  -l app.kubernetes.io/name=alloy \
  --tail=100
```

Check Loki:

```bash
kubectl get pods -n loki
kubectl get svc -n loki
```

Check S3 permissions and Pod Identity.

---

## Tempo receives no traces

Check:

```bash
kubectl get pods -n tempo

kubectl logs \
  -n tempo \
  tempo-0 \
  --tail=100
```

Check application OTEL environment:

```bash
kubectl exec -n devsecops deploy/user-service -- env | grep OTEL
```

Repeat for product and order services.

---

## Grafana cannot query Loki

Verify Loki service:

```bash
kubectl get svc -n loki
```

Expected service DNS used by Grafana:

```text
loki-gateway.loki.svc.cluster.local
```

---

## Grafana cannot query Tempo

Verify:

```bash
kubectl get svc -n tempo
```

Expected Tempo query endpoint in this configuration:

```text
http://tempo.tempo.svc.cluster.local:3200
```

---

# 106. Important Design Rules

## Rule 1 — Git is the source of truth

Do not manually change application deployments in the cluster when Argo CD owns those resources.

Change:

```text
Git
  -> Argo CD
  -> Kubernetes
```

not:

```text
kubectl edit deployment
```

for normal application changes.

---

## Rule 2 — Jenkins builds; Argo CD deploys

Jenkins is responsible for CI:

```text
Build
Test
Scan
Package
Push image
Update Git
```

Argo CD is responsible for CD/GitOps:

```text
Read Git
Compare desired state
Synchronize Kubernetes
```

This separation is intentional.

---

## Rule 3 — Do not expose private services

Jenkins and RDS should remain private.

The Bastion is the administrative entry point.

---

## Rule 4 — Never commit secrets

Do not commit:

```text
AWS keys
AWS secret keys
RDS passwords
Gmail app passwords
SonarQube tokens
JWT secrets
Jenkins passwords
Argo CD passwords
JWT access tokens
SSH private keys
```

---

## Rule 5 — Use placeholders in documentation

Use:

```text
<AWS_ACCOUNT_ID>
<RDS_ENDPOINT>
<RDS_PASSWORD>
<ACM_CERTIFICATE_ARN>
<GITHUB_REPOSITORY>
<DOMAIN>
```

Never use real production credentials in README files.

---

# 107. Final Architecture

The completed platform should look like this:

```text
                             USERS
                               |
                               v
                         Route 53 DNS
                               |
                               v
                         ACM HTTPS/TLS
                               |
                               v
                     AWS Load Balancer
                               |
                               v
                     Kubernetes Gateway API
                               |
                               v
                         EKS Cluster
                               |
        +----------------------+----------------------+
        |                      |                      |
        v                      v                      v
    Frontend              Microservices          Observability
                              |                      |
                    +---------+---------+       +----+-----+
                    |         |         |       |    |    |
                    v         v         v       v    v    v
                  User     Product     Order   Prom  Loki Tempo
                    |         |         |       |    ^    ^
                    +---------+---------+       |    |    |
                              |                 |  Alloy  |
                              v                 |         |
                         RDS MySQL             |    OTEL |
                                                |         |
                                                +----+----+
                                                     |
                                                   Grafana
                                                     |
                                      +--------------+--------------+
                                      |              |              |
                                   Metrics          Logs          Traces
                                      |              |              |
                                  Prometheus        Loki          Tempo
                                                     |              |
                                                     v              v
                                                    S3             S3


                         CI/CD + GitOps
                         ==============

Developer
   |
   v
GitHub
   |
   v
Jenkins
   |
   +--> Maven
   +--> Gitleaks
   +--> SonarQube
   +--> Trivy
   +--> Docker
   |
   v
Amazon ECR
   |
   v
Git/Kustomize
   |
   v
Argo CD
   |
   v
EKS
   |
   v
Argo Rollouts
   |
   +--> Preview
   |
   +--> Validation
   |
   +--> Manual Promotion
   |
   v
Production
```

---

# 108. What "Done" Means

The implementation is complete only when all of the following are true:

```text
AWS
  |
  +-- Network works
  +-- Private/public separation works
  +-- EKS works
  +-- RDS works
  +-- ECR works

CI
  |
  +-- Jenkins works
  +-- Maven works
  +-- Gitleaks works
  +-- SonarQube works
  +-- Trivy works
  +-- Docker image reaches ECR

CD
  |
  +-- Argo CD works
  +-- Git repository sync works
  +-- Kustomize deployment works
  +-- Argo Rollouts works
  +-- Preview validation works
  +-- Manual promotion works

Observability
  |
  +-- Prometheus collects metrics
  +-- Alertmanager sends Gmail alerts
  +-- Grafana displays metrics
  +-- Alloy collects logs
  +-- Loki stores/searches logs
  +-- Tempo stores/searches traces
  +-- Grafana correlates metrics/logs/traces

Application
  |
  +-- HTTPS works
  +-- User registration works
  +-- Login works
  +-- Product creation works
  +-- Product listing works
  +-- Order creation works
```

---

# 109. Project Completion Flow

The final operating model is:

```text
Developer pushes code
        |
        v
GitHub
        |
        v
Jenkins
        |
        +--> Build
        +--> Test
        +--> Gitleaks
        +--> SonarQube
        +--> Trivy
        +--> Docker Build
        +--> ECR Push
        |
        v
Git/Kustomize update
        |
        v
Argo CD
        |
        v
EKS
        |
        v
Argo Rollouts
        |
        +--> Preview deployment
        |
        +--> Health/API validation
        |
        +--> Manual promotion
        |
        v
Production
        |
        +--> Prometheus
        +--> Loki
        +--> Tempo
        +--> Grafana
        |
        v
Operational visibility
```

This is the intended end state of the DevSecOps project.
