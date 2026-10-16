// 사용자별로 생성된 기간별 관리 기록지를 저장합니다.
package com.example.folio.entity;

import jakarta.persistence.*;

@Entity
public class ManagementReport extends OwnedRecord {

    @Id
    public String id;

    public String period;
    public String startDate;
    public String endDate;
    public String fingerprint;
    public String source;

    @Column(length = 2000)
    public String briefing;

    @Column(length = 20000)
    public String content;

    public String generatedAt;
}
