package com.example.eikensystem.web;

import org.springframework.stereotype.Component;

@Component
public class Calculator {
    // qty = quantityPerMeasurement
    public double standardWeight(double weightPerPiece, int qty) {
        return weightPerPiece * qty;
    }
    // Min = Std - wpp/2
    public double minWeight(double weightPerPiece, int qty) {
        return standardWeight(weightPerPiece, qty) - weightPerPiece / 2.0;
    }
    // Max = Std + wpp/2
    public double maxWeight(double weightPerPiece, int qty) {
        return standardWeight(weightPerPiece, qty) + weightPerPiece / 2.0;
    }
    // DMin = Std - wpp/4
    public double dMin(double std, double weightPerPiece) {
        return std - weightPerPiece / 4.0;
    }
    // DMax = Std + wpp/4
    public double dMax(double std, double weightPerPiece) {
        return std + weightPerPiece / 4.0;
    }
    // qty = quantityPerMeasurement; tolerance param kept for API compat but devW is always wpp/4
    public String classify(double weight, double weightPerPiece, int qty, double tolerance) {
        double s   = standardWeight(weightPerPiece, qty);
        double mn  = s - weightPerPiece / 2.0;
        double mx  = s + weightPerPiece / 2.0;
        double dmn = s - weightPerPiece / 4.0;
        double dmx = s + weightPerPiece / 4.0;
        if (weight >= dmn && weight <= dmx) return "GREEN";
        if ((weight < dmn && weight >= mn) || (weight > dmx && weight <= mx)) return "YELLOW";
        return "RED";
    }
}
