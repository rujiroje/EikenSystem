package com.example.eikensystem.repo;

import com.example.eikensystem.domain.Measurement;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.time.LocalDateTime;
import java.util.List;

public interface MeasurementRepo extends JpaRepository<Measurement, Long> {
    Optional<Measurement> findTopByProduct_ProductCodeAndScale_ScaleIdAndLotNoOrderByTimestampDesc(
	    String productCode, String scaleId, String lotNo);

    boolean existsByProduct_ProductCodeAndScale_ScaleIdAndLotNoAndOuterBoxNumberAndInnerBoxOrder(
	    String productCode, String scaleId, String lotNo, String outerBoxNumber, String innerBoxOrder);

	Optional<Measurement> findByProduct_ProductCodeAndScale_ScaleIdAndLotNoAndOuterBoxNumberAndInnerBoxOrder(
		String productCode, String scaleId, String lotNo, String outerBoxNumber, String innerBoxOrder);

	List<Measurement> findTop50ByScale_ScaleIdOrderByTimestampDesc(String scaleId);

	List<Measurement> findTop100ByScale_ScaleIdOrderByTimestampDesc(String scaleId);

	// สำหรับกรณีที่ต้องการกรอง barrier (innerBoxOrder ไม่ใช่ตัวเลข) จะดึงหลายรายการมาสแกนเองที่ Controller
	List<Measurement> findTop100ByProduct_ProductCodeAndScale_ScaleIdAndLotNoOrderByTimestampDesc(
		String productCode, String scaleId, String lotNo);

	// Fetch recent measurements for a product+scale so controllers can build lot summaries
	List<Measurement> findByProduct_ProductCodeAndScale_ScaleIdOrderByTimestampDesc(String productCode, String scaleId);

	List<Measurement> findByApprovalId(Long approvalId);

	List<Measurement> findByProduct_ProductCodeAndScale_ScaleIdAndLotNoAndOuterBoxNumberOrderByInnerBoxOrderAsc(
		String productCode, String scaleId, String lotNo, String outerBoxNumber);

	Optional<Measurement> findTopByProduct_ProductCodeAndLotNoOrderByTimestampDesc(String productCode, String lotNo);

	boolean existsByProduct_ProductCodeAndLotNoAndOuterBoxNumberAndInnerBoxOrder(String productCode, String lotNo, String outerBoxNumber, String innerBoxOrder);

	// CONTINUOUS mode: ตรวจว่า inner นี้ถูกใช้ไปแล้วในทุก outer ของ lot (inner unique ทั้ง lot)
	boolean existsByProduct_ProductCodeAndLotNoAndInnerBoxOrder(String productCode, String lotNo, String innerBoxOrder);

	List<Measurement> findByProduct_ProductCodeAndLotNoAndOuterBoxNumberOrderByInnerBoxOrderAsc(String productCode, String lotNo, String outerBoxNumber);

	List<Measurement> findTop100ByProduct_ProductCodeAndLotNoOrderByTimestampDesc(String productCode, String lotNo);

	Optional<Measurement> findByProduct_ProductCodeAndLotNoAndOuterBoxNumberAndInnerBoxOrder(String productCode, String lotNo, String outerBoxNumber, String innerBoxOrder);

	/** ตรวจว่า WO (product+lotNo) มีบันทึกการผลิตอยู่แล้วหรือไม่ — ใช้ก่อน delete WO */
	boolean existsByProduct_ProductCodeAndLotNo(String productCode, String lotNo);

	List<Measurement> findByProduct_ProductCodeAndScale_ScaleIdAndLotNoOrderByTimestampDesc(
			String productCode, String scaleId, String lotNo);

	Optional<Measurement> findTopByProduct_ProductCodeAndLotNoAndIsForStandardAdjustmentTrueOrderByTimestampDesc(String productCode, String lotNo);

	List<Measurement> findByProduct_ProductCodeAndLotNoAndIsForStandardAdjustmentTrueOrderByTimestampAsc(String productCode, String lotNo);

	// Find the first few measurements that happened AFTER a specific time (for traceability)
	List<Measurement> findTop10ByProduct_ProductCodeAndScale_ScaleIdAndLotNoAndTimestampAfterOrderByTimestampAsc(String productCode, String scaleId, String lotNo, LocalDateTime timestamp);

	// Count by status per WO — used for cross-WO performance summary (avoids loading all records)
	@org.springframework.data.jpa.repository.Query(
		"SELECT m.status, COUNT(m) FROM Measurement m " +
		"WHERE m.product.productCode = :pc AND m.scale.scaleId = :si AND m.lotNo = :lo " +
		"AND m.outerBoxNumber <> '000' " +
		"AND (m.isForStandardAdjustment IS NULL OR m.isForStandardAdjustment = false) " +
		"GROUP BY m.status")
	List<Object[]> countStatusByWo(
		@org.springframework.data.repository.query.Param("pc") String pc,
		@org.springframework.data.repository.query.Param("si") String si,
		@org.springframework.data.repository.query.Param("lo") String lo);
}
