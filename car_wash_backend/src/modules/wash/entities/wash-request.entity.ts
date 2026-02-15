import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum WashRequestStatus {
  REQUESTED = 'REQUESTED',
  ACCEPTED = 'ACCEPTED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

@Entity('wash_requests')
export class WashRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'ownerId' })
  owner: User;

  @Column()
  ownerId: string;

  @ManyToOne(() => User, { eager: true, nullable: true })
  @JoinColumn({ name: 'washerId' })
  washer: User | null;

  @Column({ nullable: true })
  washerId: string | null;

  @Column({ type: 'enum', enum: WashRequestStatus, default: WashRequestStatus.REQUESTED })
  status: WashRequestStatus;

  @Column({ type: 'double precision' })
  pickupLat: number;

  @Column({ type: 'double precision' })
  pickupLng: number;

  @Column({ type: 'double precision', nullable: true })
  washerLat: number | null;

  @Column({ type: 'double precision', nullable: true })
  washerLng: number | null;

  @Column({ type: 'timestamp', nullable: true })
  washerLocationUpdatedAt: Date | null;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
