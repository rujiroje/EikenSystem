package com.example.eikensystem.config;

import com.example.eikensystem.domain.Machine;
import com.example.eikensystem.repo.MachineRepo;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
@RequiredArgsConstructor
public class DataSeeder {

    private final MachineRepo machineRepo;

    @EventListener(ApplicationReadyEvent.class)
    public void seedMachines() {
        if (machineRepo.count() > 0) return; // Already seeded

        List<Machine> defaults = List.of(
            machine("RLB101",     "RLB101",     "PRODUCTION", 1),
            machine("RLB102",     "RLB102",     "PRODUCTION", 2),
            machine("RLB109",     "RLB109",     "PRODUCTION", 3),
            machine("RPK101",     "RPK101",     "PRODUCTION", 4),
            machine("MANUAL-SOC", "Manual S-OC","MANUAL",     5),
            machine("MANUAL-HOC", "Manual H-OC","MANUAL",     6),
            machine("PACK-BL",    "Pack BL",    "PACKING",    7)
        );
        machineRepo.saveAll(defaults);
    }

    private Machine machine(String id, String name, String type, int order) {
        Machine m = new Machine();
        m.setMachineId(id);
        m.setMachineName(name);
        m.setMachineType(type);
        m.setIsActive(true);
        m.setSortOrder(order);
        return m;
    }
}
