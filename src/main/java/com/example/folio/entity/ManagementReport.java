package com.example.folio.entity;

import jakarta.persistence.*;

@Entity
public class ManagementReport {

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
