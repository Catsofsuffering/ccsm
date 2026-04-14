//go:build windows
// +build windows

package main

import (
	"os"
	"os/exec"
	"testing"
	"time"
)

func TestIsProcessRunning(t *testing.T) {
	t.Run("current process", func(t *testing.T) {
		if !isProcessRunning(os.Getpid()) {
			t.Fatalf("expected current process (pid=%d) to be running", os.Getpid())
		}
	})

	t.Run("fake pid", func(t *testing.T) {
		const nonexistentPID = 1 << 30
		if isProcessRunning(nonexistentPID) {
			t.Fatalf("expected pid %d to be reported as not running", nonexistentPID)
		}
	})

	t.Run("terminated process", func(t *testing.T) {
		cmd := exec.Command("cmd", "/c", "exit 0")
		if err := cmd.Start(); err != nil {
			t.Fatalf("failed to start helper process: %v", err)
		}
		pid := cmd.Process.Pid
		if err := cmd.Wait(); err != nil {
			t.Fatalf("helper process did not exit cleanly: %v", err)
		}

		time.Sleep(100 * time.Millisecond)
		if isProcessRunning(pid) {
			t.Fatalf("expected exited child process (pid=%d) to be reported as not running", pid)
		}
	})

	t.Run("boundary values", func(t *testing.T) {
		if isProcessRunning(0) {
			t.Fatalf("pid 0 should never be treated as running")
		}
		if isProcessRunning(-42) {
			t.Fatalf("negative pid should never be treated as running")
		}
	})
}

func TestGetProcessStartTimeReadsProcStat(t *testing.T) {
	got := getProcessStartTime(os.Getpid())
	if got.IsZero() {
		t.Fatalf("expected current process to have a non-zero start time")
	}
}

func TestGetProcessStartTimeInvalidData(t *testing.T) {
	if got := getProcessStartTime(0); !got.IsZero() {
		t.Fatalf("pid 0 should return zero time, got %v", got)
	}
	if got := getProcessStartTime(-1); !got.IsZero() {
		t.Fatalf("negative pid should return zero time, got %v", got)
	}
}

func TestGetBootTimeParsesBtime(t *testing.T) {
	t.Skip("boot time parsing is only implemented on Unix-like platforms")
}

func TestGetBootTimeInvalidData(t *testing.T) {
	t.Skip("boot time parsing is only implemented on Unix-like platforms")
}
