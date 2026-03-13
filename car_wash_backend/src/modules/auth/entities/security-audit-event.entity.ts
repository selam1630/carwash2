import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('security_audit_events')
export class SecurityAuditEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  eventType: string;

  @Column({ default: 'WARN' })
  severity: string;

  @Column({ nullable: true })
  userId?: string;

  @Column({ nullable: true })
  phone?: string;

  @Column({ nullable: true })
  ip?: string;

  @Column({ nullable: true })
  userAgent?: string;

  @Column({ nullable: true })
  route?: string;

  @Column({ type: 'simple-json', nullable: true })
  details?: Record<string, unknown>;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}

