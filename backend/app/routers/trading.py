import logging

from fastapi import APIRouter, Depends, HTTPException

from app import alpaca_client
from app.auth import require_auth
from app.schemas import Account, OrderRequest, OrderResponse, Position

logger = logging.getLogger("entro.trading")
router = APIRouter(prefix="/api/trading", tags=["trading"], dependencies=[Depends(require_auth)])


@router.post("/orders", response_model=OrderResponse)
def create_order(order: OrderRequest) -> OrderResponse:
    try:
        return alpaca_client.submit_order(order)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:  # noqa: BLE001
        logger.exception("submit_order failed")
        raise HTTPException(status_code=502, detail=str(e)) from e


@router.get("/positions", response_model=list[Position])
def positions() -> list[Position]:
    try:
        return alpaca_client.get_positions()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception as e:  # noqa: BLE001
        logger.exception("positions failed")
        raise HTTPException(status_code=502, detail=str(e)) from e


@router.get("/account", response_model=Account)
def account() -> Account:
    try:
        return alpaca_client.get_account()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception as e:  # noqa: BLE001
        logger.exception("account failed")
        raise HTTPException(status_code=502, detail=str(e)) from e
