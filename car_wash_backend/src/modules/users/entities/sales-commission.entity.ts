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

export enum CommissionSource {
  OWNER_REGISTRATION = 'OWNER_REGISTRATION',
  SALES_RECRUITMENT = 'SALES_RECRUITMENT',
}

@Entity('sales_commissions')
export class SalesCommission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => SalesProfile, { onDelete: 'CASCADE' })
  @JoinColumn()
  salesProfile: SalesProfile;

  @ManyToOne(() => OwnerProfile, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn()
  ownerProfile: OwnerProfile | null;

  @ManyToOne(() => SalesProfile, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'recruitedSalesProfileId' })
  recruitedSalesProfile: SalesProfile | null;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({
    type: 'enum',
    enum: CommissionStatus,
    default: CommissionStatus.PENDING,
  })
  status: CommissionStatus;

  @Column({
    type: 'enum',
    enum: CommissionSource,
    default: CommissionSource.OWNER_REGISTRATION,
  })
  source: CommissionSource;

  @CreateDateColumn()
  createdAt: Date;
}
