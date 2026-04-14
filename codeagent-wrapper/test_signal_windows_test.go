//go:build windows

package main

import "os"

func testTerminateSignal() os.Signal {
	return os.Interrupt
}

func testInterruptSignal() os.Signal {
	return os.Interrupt
}

func testResetSignals() []os.Signal {
	return []os.Signal{os.Interrupt}
}
