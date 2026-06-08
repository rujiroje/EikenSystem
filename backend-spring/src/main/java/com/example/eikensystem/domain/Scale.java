package com.example.eikensystem.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Data;

@Data
@Entity
@Table(name = "scale")
public class Scale {
    @Id
    private String scaleId;
    private String scaleName;
    /** หน่วยของเครื่องชั่ง: "g" หรือ "kg" */
    private String weightUnit;
    private String description;
    private Boolean isActive;
}
