job('Hello World') {
    steps {
        shell('echo "Hello world!!"')
    }
    logRotator {
        numToKeep(3)
    }
}
