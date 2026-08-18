#!/bin/bash

set -e

echo "========================================="
echo " Jenkins CI Server Setup"
echo " Amazon Linux 2023"
echo " Java 21 + Maven + Jenkins"
echo "========================================="

# --------------------------------------------------
# 1. System update
# --------------------------------------------------

echo "=== Updating system ==="

dnf update -y


# --------------------------------------------------
# 2. Install required packages
# --------------------------------------------------

echo "=== Installing base packages ==="

dnf install -y \
    java-21-amazon-corretto-devel \
    maven \
    git \
    docker \
    curl \
    wget \
    tar \
    gzip \
    unzip \
    jq


# --------------------------------------------------
# 3. Configure Java 21 as default
# --------------------------------------------------

echo "=== Configuring Java 21 ==="

alternatives --set java \
/usr/lib/jvm/java-21-amazon-corretto.x86_64/bin/java

alternatives --set javac \
/usr/lib/jvm/java-21-amazon-corretto.x86_64/bin/javac


# --------------------------------------------------
# 4. Configure JAVA_HOME globally
# --------------------------------------------------

echo "=== Configuring JAVA_HOME ==="

cat > /etc/profile.d/java.sh <<'EOF'
export JAVA_HOME=/usr/lib/jvm/java-21-amazon-corretto.x86_64
export PATH=$JAVA_HOME/bin:$PATH
EOF

chmod 644 /etc/profile.d/java.sh

source /etc/profile.d/java.sh


# --------------------------------------------------
# 5. Verify Java
# --------------------------------------------------

echo "=== Java verification ==="

echo "JAVA_HOME=$JAVA_HOME"

which java
which javac

java -version
javac -version


# --------------------------------------------------
# 6. Verify Maven
# --------------------------------------------------

echo "=== Maven verification ==="

which mvn

mvn --version


# --------------------------------------------------
# 7. Configure Docker
# --------------------------------------------------

echo "=== Configuring Docker ==="

systemctl enable --now docker

systemctl status docker --no-pager

docker --version


# --------------------------------------------------
# 8. Install Jenkins repository
# --------------------------------------------------

echo "=== Installing Jenkins ==="

curl -fsSL https://pkg.jenkins.io/redhat-stable/jenkins.io-2026.key \
    -o /etc/pki/rpm-gpg/jenkins.io.key

rpm --import /etc/pki/rpm-gpg/jenkins.io.key

cat > /etc/yum.repos.d/jenkins.repo <<'EOF'
[jenkins]
name=Jenkins-stable
baseurl=https://pkg.jenkins.io/redhat-stable
gpgcheck=1
gpgkey=file:///etc/pki/rpm-gpg/jenkins.io.key
enabled=1
EOF

dnf clean all

dnf makecache

dnf install -y jenkins


# --------------------------------------------------
# 9. Configure Jenkins to use Java 21
# --------------------------------------------------

echo "=== Configuring Jenkins Java 21 ==="

mkdir -p /etc/systemd/system/jenkins.service.d

cat > /etc/systemd/system/jenkins.service.d/override.conf <<'EOF'
[Service]
Environment="JAVA_HOME=/usr/lib/jvm/java-21-amazon-corretto.x86_64"
Environment="PATH=/usr/lib/jvm/java-21-amazon-corretto.x86_64/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin"
EOF


# --------------------------------------------------
# 10. Reload systemd
# --------------------------------------------------

echo "=== Reloading systemd ==="

systemctl daemon-reload


# --------------------------------------------------
# 11. Configure Jenkins user for Docker
# --------------------------------------------------

echo "=== Adding Jenkins user to Docker group ==="

usermod -aG docker jenkins


# --------------------------------------------------
# 12. Enable and start Jenkins
# --------------------------------------------------

echo "=== Starting Jenkins ==="

systemctl enable --now jenkins


# --------------------------------------------------
# 13. Verify Jenkins
# --------------------------------------------------

echo "=== Jenkins status ==="

systemctl status jenkins --no-pager


# --------------------------------------------------
# 14. Verify Jenkins Java process
# --------------------------------------------------

echo "=== Jenkins Java process ==="

ps -ef | grep '[j]enkins'


# --------------------------------------------------
# 15. Install Gitleaks
# --------------------------------------------------

echo "=== Installing Gitleaks ==="

GITLEAKS_VERSION="8.30.1"

cd /tmp

rm -f gitleaks.tar.gz

curl -fL \
"https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz" \
-o gitleaks.tar.gz

tar -xzf gitleaks.tar.gz

install -m 0755 gitleaks /usr/local/bin/gitleaks

rm -f gitleaks gitleaks.tar.gz


# --------------------------------------------------
# 16. Verify Gitleaks
# --------------------------------------------------

echo "=== Gitleaks verification ==="

gitleaks version


# --------------------------------------------------
# 17. Verify AWS CLI
# --------------------------------------------------

echo "=== AWS CLI verification ==="

aws --version


# --------------------------------------------------
# 18. Final verification
# --------------------------------------------------

echo ""
echo "========================================="
echo " FINAL TOOL VERIFICATION"
echo "========================================="

echo ""
echo "=== JAVA ==="
java -version

echo ""
echo "=== JAVA_HOME ==="
echo "$JAVA_HOME"

echo ""
echo "=== MAVEN ==="
mvn --version

echo ""
echo "=== GIT ==="
git --version

echo ""
echo "=== DOCKER ==="
docker --version

echo ""
echo "=== AWS ==="
aws --version

echo ""
echo "=== GITLEAKS ==="
gitleaks version

echo ""
echo "=== JENKINS ==="
systemctl is-active jenkins

echo ""
echo "========================================="
echo " Jenkins CI Server Setup Complete"
echo "========================================="