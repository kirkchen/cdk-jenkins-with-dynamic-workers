job('Windows Job') {
    label('windows')
    steps {
        powerShell('echo "Hello world!!"')
    }
    logRotator {
        numToKeep(3)
    }
}
