pipeline{
    agent any

    environment {
        AWS_REGION = 'ap-south-1'
        ECR_REGISTRY =  '425034746703.dkr.ecr.ap-south-1.amazonaws.com'
        TRIVY_CACHE_DIR = '/var/lib/trivy'
        TMPDIR = '/var/lib/trivy-tmp'

        USER_IMAGE = 'user-service'
        PRODUCT_IMAGE = 'prodcut-service'
        ORDER_IMAGE = 'order-service'
        FRONTEND_IMAGE = 'frontend'
    }

    stages {
        stage ('checkout') {
            steps {
                git (
                    url: 'git@github.com:sathish103/devsecops-project.git',
                    branch: 'main',
                    credentialsId: 'github-ssh'
                )
            }
        }

        stage('Gitleaks') {
            steps {
                sh '''
                    gitleaks detect \
                        --source . \
                        --no-banner

                    echo "Gitleaks scan completed successfully."
                '''
            }
        }

        stage('Maven Bild & Test') {
            steps {
                sh '''
                echo "---USER SERVICE ---"
                cd user-service
                mvn clean package
                cd ..

                echo "---PRODUCT SERVICE ---"
                cd product-service
                mvn clean package
                cd ..

                echo "---ORDER SERVICE---"
                cd order-service
                mvn clean package
                cd ..
            '''

            }

        }

        stage ('Docker Build and Tag') {
            steps {
                sh '''
                docker build   -t ${ECR_REGISTRY}/${USER_IMAGE}:${BUILD_NUMBER} ./user-service
                docker build  -t ${ECR_REGISTRY}/${PRODUCT_IMAGE}:${BUILD_NUMBER} ./product-service
                docker build  -t ${ECR_REGISTRY}/${ORDER_IMAGE}:${BUILD_NUMBER} ./order-service
                docker build  -t ${ECR_REGISTRY}/${FRONTEND_IMAGE}:${BUILD_NUMBER} ./frontend

                docker images
            '''
            } 
        }

        stage ('Docker Image scan') {
            steps {
                sh '''
                set -e
                echo "=== Trivy Security Scan ==="

                trivy image --severity HIGH,CRITICAL --exit-code 1 ${ECR_REGISTRY}/${USER_IMAGE}:${BUILD_NUMBER}
                trivy image --severity HIGH,CRITICAL --exit-code 1 ${ECR_REGISTRY}/${PRODUCT_IMAGE}:${BUILD_NUMBER}
                trivy image --severity HIGH,CRITICAL --exit-code 1 ${ECR_REGISTRY}/${ORDER_IMAGE}:${BUILD_NUMBER}
                trivy image --severity HIGH,CRITICAL --exit-code 1 ${ECR_REGISTRY}/${FRONTEND_IMAGE}:${BUILD_NUMBER}

            '''
            }
        }
        stage ('ECR Login'){
            steps{
                sh ''''
                echo "=== Logging into Amazon ECR ==="
                aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${ECR_REGISTRY}
            '''
            }
        }
        stage ('Push Images'){
            steps {
                sh '''
                    set -e
                    echo "=== Pushing Images to ECR ==="
                    docker push ${ECR_REGISTRY}/${USER_IMAGE}:${BUILD_NUMBER}
                    docker push ${ECR_REGISTRY}/${PRODUCT_IMAGE}:${BUILD_NUMBER} 
                    docker push ${ECR_REGISTRY}/${ORDER_IMAGE}:${BUILD_NUMBER} 
                    docker push ${ECR_REGISTRY}/${FRONTEND_IMAGE}:${BUILD_NUMBER}
                '''
            }
        }
    }

    post {
        success {
            echo 'CI PIPELINE SUCCESS'
        }

        failure {
            echo 'CI PIPELINE FAILED'
        }

        always {
            echo "Jenkins CI build completed: ${BUILD_NUMBER}"
        }
    }
}