# Reference: https://www.digitalocean.com/community/tutorials/how-to-automate-jenkins-setup-with-docker-and-jenkins-configuration-as-code
FROM jenkins/jenkins:2.249.3-lts

# Stop Jenkin's  setup wizard
ENV JAVA_OPTS -Djenkins.install.runSetupWizard=false

# Configuration as code settings path
ENV CASC_JENKINS_CONFIG /var/jenkins_home/casc.yaml

# Install Jenkin's plugins
COPY plugins.txt /usr/share/jenkins/ref/plugins.txt
RUN /usr/local/bin/install-plugins.sh < /usr/share/jenkins/ref/plugins.txt

# Copy configuration as code settings
COPY casc.yaml /var/jenkins_home/casc.yaml
