pipeline{
    agent any

    environment {
        AWS_REGION = 'ap-south-1'
        ECR_REGISTRY =  '425034746703.dkr.ecr.ap-south-1.amazonaws.com'
        TRIVY_CACHE_DIR = '/var/lib/trivy'
        TMPDIR = '/var/lib/trivy-tmp'

        USER_IMAGE = 'devsecops-user-service'
        PRODUCT_IMAGE = 'devsecops-product-service'
        ORDER_IMAGE = 'devsecops-order-service'
        FRONTEND_IMAGE = 'devsecops-frontend'
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

        stage('Maven Build & Test') {
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

        stage('SonarQube - User Service') {
            steps {
                withSonarQubeEnv('SonarQube') {
                    sh '''
                        set -e

                        echo "=== SonarQube: USER SERVICE ==="

                        # Remove ALL old SonarQube task files
                        find . -name report-task.txt -delete

                        cd user-service

                        mvn org.sonarsource.scanner.maven:sonar-maven-plugin:sonar \
                            -Dsonar.projectKey=user-service \
                            -Dsonar.projectName=user-service

                        echo "User service SonarQube analysis completed."
                    '''
                }
            }
        }

        stage('Quality Gate - User Service') {
            steps {
                timeout(time: 2, unit: 'MINUTES') {
                    waitForQualityGate abortPipeline: true
                }
            }
        }

        /*
         * ============================================================
         * PRODUCT SERVICE - SONARQUBE
         * ============================================================
         */

        stage('SonarQube - Product Service') {
            steps {
                withSonarQubeEnv('SonarQube') {
                    sh '''
                        set -e

                        echo "=== SonarQube: PRODUCT SERVICE ==="

                        # Remove ALL old SonarQube task files
                        find . -name report-task.txt -delete

                        cd product-service

                        mvn org.sonarsource.scanner.maven:sonar-maven-plugin:sonar \
                            -Dsonar.projectKey=product-service \
                            -Dsonar.projectName=product-service

                        echo "Product service SonarQube analysis completed."
                    '''
                }
            }
        }

        stage('Quality Gate - Product Service') {
            steps {
                timeout(time: 2, unit: 'MINUTES') {
                    waitForQualityGate abortPipeline: true
                }
            }
        }

        /*
         * ============================================================
         * ORDER SERVICE - SONARQUBE
         * ============================================================
         */

        stage('SonarQube - Order Service') {
            steps {
                withSonarQubeEnv('SonarQube') {
                    sh '''
                        set -e

                        echo "=== SonarQube: ORDER SERVICE ==="

                        # Remove ALL old SonarQube task files
                        find . -name report-task.txt -delete

                        cd order-service

                        mvn org.sonarsource.scanner.maven:sonar-maven-plugin:sonar \
                            -Dsonar.projectKey=order-service \
                            -Dsonar.projectName=order-service

                        echo "Order service SonarQube analysis completed."
                    '''
                }
            }
        }

        stage('Quality Gate - Order Service') {
            steps {
                timeout(time: 2, unit: 'MINUTES') {
                    waitForQualityGate abortPipeline: true
                }
            }
        }

        stage('SonarQube Analysis Frontend') {
            steps { 
                script { 
                    def scannerHome = tool 'SonarScanner' 
                    withSonarQubeEnv('SonarQube') { 
                        withEnv(["PATH+SONAR=${scannerHome}/bin"]) { 
                            sh ''' 
                            set -e

                                echo "=== SonarQube: FRONTEND ==="

                                # Remove ALL old SonarQube task files
                                find . -name report-task.txt -delete

                                cd frontend

                                sonar-scanner \
                                    -Dsonar.projectKey=frontend \
                                    -Dsonar.projectName=frontend \
                                    -Dsonar.sources=src

                                cd ..

                                echo "Frontend SonarQube analysis completed."
                        ''' 
                            } 
                        } 
                    } 
                } 
            } 
            
            stage('Quality Gate - Frontend') { 
                steps { 
                    timeout(time: 2, unit: 'MINUTES') { 
                        waitForQualityGate abortPipeline: true 
                    } 
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
                sh '''
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

        stage('Deploy to EKS') {
            steps {
                sh '''
                    set -e

                    echo "=== Deploying Build ${BUILD_NUMBER} to EKS ==="

                    kubectl set image deployment/user-service \
                    user-service=${ECR_REGISTRY}/${USER_IMAGE}:${BUILD_NUMBER} \
                    -n devsecops

                    kubectl set image deployment/product-service \
                    product-service=${ECR_REGISTRY}/${PRODUCT_IMAGE}:${BUILD_NUMBER} \
                    -n devsecops

                    kubectl set image deployment/order-service \
                    order-service=${ECR_REGISTRY}/${ORDER_IMAGE}:${BUILD_NUMBER} \
                    -n devsecops

                    kubectl set image deployment/frontend \
                    frontend=${ECR_REGISTRY}/${FRONTEND_IMAGE}:${BUILD_NUMBER} \
                    -n devsecops

                    echo "=== Waiting for Kubernetes rollouts ==="

                    kubectl rollout status deployment/user-service \
                    -n devsecops --timeout=5m

                    kubectl rollout status deployment/product-service \
                    -n devsecops --timeout=5m

                    kubectl rollout status deployment/order-service \
                    -n devsecops --timeout=5m

                    kubectl rollout status deployment/frontend \
                    -n devsecops --timeout=5m

                    echo "=== EKS deployment completed successfully ==="

                    echo "=== Current deployed images ==="

                    kubectl get deployments -n devsecops \
                    -o custom-columns='NAME:.metadata.name,IMAGE:.spec.template.spec.containers[0].image'
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