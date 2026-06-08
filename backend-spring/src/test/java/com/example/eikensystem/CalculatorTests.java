package com.example.eikensystem;

import com.example.eikensystem.web.Calculator;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

public class CalculatorTests {
    private final Calculator calc = new Calculator();

    @Test
    void greenRange() {
        // wpp=10, qty=5 → std=50, min=46, max=56, dMin=47.5, dMax=52.5
        double s   = calc.standardWeight(10.0, 5);   // 50
        double dmn = calc.dMin(50.0, 10.0);           // 47.5
        double dmx = calc.dMax(50.0, 10.0);           // 52.5
        assertEquals(50.0,  s,   0.0001, "Standard weight should be 50");
        assertEquals(47.5,  dmn, 0.0001, "DMin should be 47.5");
        assertEquals(52.5,  dmx, 0.0001, "DMax should be 52.5");
        assertEquals("GREEN", calc.classify(50.0, 10.0, 5, 0.0));
        assertEquals("GREEN", calc.classify(49.5, 10.0, 5, 0.0));
        assertEquals("GREEN", calc.classify(50.8, 10.0, 5, 0.0));
    }

    @Test
    void yellowBoundary() {
        // wpp=10, qty=5 → dMin=47.5, min=46 → 47.0 is between min and dMin → YELLOW
        assertEquals("YELLOW", calc.classify(47.0, 10.0, 5, 0.0));
        // dMax=52.5, max=56 → 53.0 is between dMax and max → YELLOW
        assertEquals("YELLOW", calc.classify(53.0, 10.0, 5, 0.0));
    }

    @Test
    void redBoundary() {
        // wpp=10, qty=5 → min=46, max=56
        assertEquals("RED", calc.classify(45.9, 10.0, 5, 0.0));
        assertEquals("RED", calc.classify(56.1, 10.0, 5, 0.0));
    }
}
