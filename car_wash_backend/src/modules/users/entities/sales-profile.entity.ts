import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  ManyToOne,
  OneToMany,
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

  @ManyToOne(() => SalesProfile, (sales) => sales.recruitedSales, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'recruitedBySalesId' })
  recruitedBySales: SalesProfile | null;

  @OneToMany(() => SalesProfile, (sales) => sales.recruitedBySales)
  recruitedSales: SalesProfile[];

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
