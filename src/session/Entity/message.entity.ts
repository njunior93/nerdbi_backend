import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne } from 'typeorm'
import { Session } from './session.entity'

@Entity()
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ enum: ['user', 'assistant'] })
  role: string

  @Column('text')
  content: string

  @Column({ nullable: true, type: 'text' })
  sql: string

  @Column({ nullable: true, type: 'jsonb' })
  chartConfig: object

  @CreateDateColumn()
  createdAt: Date

  @ManyToOne(() => Session, session => session.messages)
  session: Session
}