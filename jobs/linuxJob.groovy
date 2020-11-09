job('Linux Job') {
    label('linux')
    steps {
        sh('echo "Hello world!!"')
    }
    logRotator {
        numToKeep(3)
    }
}
