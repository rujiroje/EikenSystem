package com.example.eikensystem.repo;

import com.example.eikensystem.domain.Approval;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import org.springframework.data.jpa.repository.Query;

public interface ApprovalRepo extends JpaRepository<Approval, Long> {
	// Leader pending — single type
	List<Approval> findByApproverRoleAndStatusAndTypeOrderByRequestedAtDesc(String approverRole, String status, String type);
	long countByApproverRoleAndStatusAndType(String approverRole, String status, String type);

	// Leader pending — multiple types (RED_EVENT + CLEANING_CHECK)
	@Query("select a from Approval a where a.approverRole=?1 and a.status=?2 and a.type in ?3 order by a.requestedAt desc")
	List<Approval> findByApproverRoleAndStatusAndTypeIn(String approverRole, String status, List<String> types);

	@Query("select count(a) from Approval a where a.approverRole=?1 and a.status=?2 and a.type in ?3")
	long countByApproverRoleAndStatusAndTypeIn(String approverRole, String status, List<String> types);

	// Filter ONLY approvals that already have contextual payload (new format) to avoid legacy duplicates
	@Query("select a from Approval a where a.approverRole=?1 and a.status=?2 and a.type=?3 and a.payloadJson is not null order by a.requestedAt desc")
	List<Approval> findWithPayload(String approverRole, String status, String type);

	@Query("select count(a) from Approval a where a.approverRole=?1 and a.status=?2 and a.type=?3 and a.payloadJson is not null")
	long countWithPayload(String approverRole, String status, String type);

	// CLEANING_CHECK: latest per scaleId
	@Query("select a from Approval a where a.type='CLEANING_CHECK' and a.targetId=?1 order by a.requestedAt desc")
	List<Approval> findCleaningCheckByTargetId(String targetId);

	// -------- QA pending for STD change requests --------
	List<Approval> findByApproverRoleAndStatusAndTypeAndStageOrderByRequestedAtDesc(String approverRole, String status, String type, String stage);
	long countByApproverRoleAndStatusAndTypeAndStage(String approverRole, String status, String type, String stage);

	// All pending approvals (for scale-status dashboard)
	List<Approval> findByStatus(String status);

	// Filter approvals by lotNo embedded in payloadJson — reduces full-table scan in ReportController
	@Query("select a from Approval a where a.payloadJson like :p1 or a.payloadJson like :p2 order by a.requestedAt desc")
	List<Approval> findByLotNoInPayload(
		@org.springframework.data.repository.query.Param("p1") String p1,
		@org.springframework.data.repository.query.Param("p2") String p2);
}
