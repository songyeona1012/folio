package com.example.folio.repository;

import com.example.folio.entity.Goal;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface GoalRepository extends JpaRepository<Goal, Long> {

    /** 새로 만든 목표가 위에 오도록 (수정해도 순서가 바뀌지 않는다) */
    List<Goal> findAllByOrderByCreatedAtDesc();
}
