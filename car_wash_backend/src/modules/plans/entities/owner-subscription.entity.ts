import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Plan } from './plan.entity';
import { OwnerProfile } from '../../users/entities/owner-profile.entity';

@Entity('owner_subscriptions')
export class OwnerSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => OwnerProfile, { onDelete: 'CASCADE' })
  @JoinColumn()
  ownerProfile: OwnerProfile;

  @ManyToOne(() => Plan, { onDelete: 'RESTRICT' })
  @JoinColumn()
  plan: Plan;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ type: 'int', default: 0 })
  washesUsed: number;

  @CreateDateColumn()
  createdAt: Date;
}
