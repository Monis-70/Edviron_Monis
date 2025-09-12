import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
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

    switch (format) {
      case 'csv':
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="transactions.csv"');
        return res.send(data);

      case 'json':
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename="transactions.json"');
        return res.json(data);

      case 'pdf':
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="transactions.pdf"');
        return res.send(data);

      default:
        res.setHeader('Content-Type', 'application/json');
        return res.json({ success: false, message: 'Invalid export format' });
    }
  }
}
