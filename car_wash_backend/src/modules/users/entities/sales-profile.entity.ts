import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('sales_profiles')
export class SalesProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User, (user) => user.salesProfile, { onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  @Column()
  fullName: string;

  @Column({ unique: true })
  nationalId: string;

  @Column({ nullable: true })
  nationalIdPhoto: string;

  @Column('jsonb')
  bankDetails: Record<string, unknown>;

  @Column()
  sponsorNationalId: string;

  @Column({ nullable: true })
  sponsorNationalIdPhoto: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
