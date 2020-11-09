job('Linux Job') {
    label('linux')
    steps {
        shell('echo "Hello world!!"')
    }
    logRotator {
        numToKeep(3)
    }
}
