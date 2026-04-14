package main

import (
	"os"
	"testing"
)

func sendSelfTestSignal(t *testing.T, sig os.Signal) {
	t.Helper()

	proc, err := os.FindProcess(os.Getpid())
	if err != nil {
		t.Fatalf("failed to find current process: %v", err)
	}
	if err := proc.Signal(sig); err != nil {
		t.Fatalf("failed to signal current process with %v: %v", sig, err)
	}
}
