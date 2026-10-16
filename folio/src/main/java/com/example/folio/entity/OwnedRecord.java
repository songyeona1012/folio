// 사용자별 기록에 소유자를 부여하고 다른 계정의 변경을 방지합니다.
package com.example.folio.entity;

import com.example.folio.security.OwnerContext;
import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;

@MappedSuperclass
public abstract class OwnedRecord {

    @JsonIgnore
    @Column(name = "owner_id", nullable = false, updatable = false)
    public Long ownerId;

    @PrePersist
    public void assignOwner() {
        ownerId = OwnerContext.id();
    }

    @PreUpdate
    @PreRemove
    public void verifyOwner() {
        if (!OwnerContext.id().equals(ownerId)) throw new SecurityException(
            "다른 계정의 데이터에 접근할 수 없습니다."
        );
    }
}
