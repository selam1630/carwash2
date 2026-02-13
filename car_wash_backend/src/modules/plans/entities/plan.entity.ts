import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
} from 'typeorm';
import { OwnerSubscription } from './owner-subscription.entity';

@Entity('plans')
export class Plan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'int' })
  washesPerMonth: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: number;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @OneToMany(() => OwnerSubscription, (sub) => sub.plan)
  subscriptions: OwnerSubscription[];
}
