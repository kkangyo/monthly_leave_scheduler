import { Request, Response } from 'express';
import Holiday from '../../service/holiday';
import HolidayRepository from '../../model/holidayRepository';
import AgentinfoRepository from '../../model/agentinfoRepository';
import errorResposne from '../module/error';

// 작년~내년 공휴일 조회 (그 달 첫 요청이면 공공데이터 API 로 먼저 갱신)
const getHolidays = async (req: Request, res: Response) => {
  try {
    console.log('Enter getHolidays');
    const holiday = new Holiday(new HolidayRepository(), new AgentinfoRepository());

    const response = await holiday.getHolidays();

    return res.status(200).json({ statusCode: 200, ...response });
  } catch (err) {
    return errorResposne(err, res);
  }
};

export = {
  getHolidays,
};
