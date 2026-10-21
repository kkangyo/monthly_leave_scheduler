import { Request, Response } from 'express';
import SuperadminService from '../../service/superadmin';
import { ForbiddenError } from '../../service/error';
import errorResposne from '../module/error';

const requireSuperadmin = (req: Request): void => {
  if (req.auth?.kind !== 'superadmin') throw new ForbiddenError('슈퍼관리자만 가능한 작업입니다');
};

const createStore = async (req: Request, res: Response) => {
  try {
    requireSuperadmin(req);
    const { storeCode, storeName } = req.body;
    const result = await new SuperadminService().createStore(storeCode, storeName);
    return res.status(201).json({ statusCode: 201, ...result });
  } catch (err) {
    return errorResposne(err, res);
  }
};

const listStores = async (req: Request, res: Response) => {
  try {
    requireSuperadmin(req);
    const stores = await new SuperadminService().listStores();
    return res.status(200).json({ statusCode: 200, stores });
  } catch (err) {
    return errorResposne(err, res);
  }
};

const deleteStore = async (req: Request, res: Response) => {
  try {
    requireSuperadmin(req);
    await new SuperadminService().deleteStore(req.params.storeId);
    return res.status(200).json({ statusCode: 200, msg: 'store deleted' });
  } catch (err) {
    return errorResposne(err, res);
  }
};

export = { createStore, listStores, deleteStore };
