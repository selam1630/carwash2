import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { SalesProfile } from './sales-profile.entity';
import { OwnerProfile } from './owner-profile.entity';

export enum CommissionStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
}

@Entity('sales_commissions')
export class SalesCommission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => SalesProfile, { onDelete: 'CASCADE' })
  @JoinColumn()
  salesProfile: SalesProfile;

  @ManyToOne(() => OwnerProfile, { onDelete: 'CASCADE' })
  @JoinColumn()
  ownerProfile: OwnerProfile;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({
    type: 'enum',
    enum: CommissionStatus,
    default: CommissionStatus.PENDING,
  })
  status: CommissionStatus;

  @CreateDateColumn()
  createdAt: Date;
}
