job('Windows Job') {
    label('windows')
    steps {
        powershell('echo "Hello world!!"')
    }
    logRotator {
        numToKeep(3)
    }
}
