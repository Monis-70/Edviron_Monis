import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
  Header,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { TransactionsService } from './transactions.service';
import { GetTransactionsDto } from './dto/get-transactions.dto';
import { TransactionFiltersDto } from './dto/transaction-filters.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller()
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get('transactions')
  @UseGuards(JwtAuthGuard)
  async getAllTransactions(@Query() query: GetTransactionsDto) {
    return this.transactionsService.getAllTransactions(query);
  }

  @Get('transactions/school/:schoolId')
  @UseGuards(JwtAuthGuard)
  async getTransactionsBySchool(
    @Param('schoolId') schoolId: string,
    @Query() filters: TransactionFiltersDto,
  ) {
    return this.transactionsService.getTransactionsBySchool(schoolId, filters);
  }

  @Get('transaction-status/:customOrderId')
  @UseGuards(JwtAuthGuard)
  async getTransactionStatus(@Param('customOrderId') customOrderId: string) {
    return this.transactionsService.getTransactionStatus(customOrderId);
  }

  @Get('transactions/analytics')
  @UseGuards(JwtAuthGuard)
  async getTransactionAnalytics(@Query() filters: any) {
    return this.transactionsService.getTransactionAnalytics(filters);
  }

  @Get('transactions/export')
  @UseGuards(JwtAuthGuard)
  async exportTransactions(
    @Query('format') format: 'csv' | 'json' | 'pdf' = 'csv',
    @Query() filters: GetTransactionsDto,
    @Res() res: Response,
  ) {
    const data = await this.transactionsService.exportTransactions(format, filters);

    if (format === 'csv') {
      res.header('Content-Type', 'text/csv');
      res.header('Content-Disposition', 'attachment; filename="transactions.csv"');
      res.send(data);
    } else if (format === 'json') {
      res.header('Content-Type', 'application/json');
      res.header('Content-Disposition', 'attachment; filename="transactions.json"');
      res.json(data);
    } else {
      res.header('Content-Type', 'application/pdf');
      res.header('Content-Disposition', 'attachment; filename="transactions.pdf"');
      res.send(data);
    }
  }
}