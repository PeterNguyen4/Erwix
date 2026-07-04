import functools
import inspect
import logging

from fastapi import HTTPException


def alpaca_errors(logger: logging.Logger):
    """Map alpaca_client exceptions to the HTTP responses our routers agree on.

    RuntimeError -> 503 (creds/upstream unavailable), ValueError -> 400 (bad input),
    anything else -> 502 (unexpected upstream failure), logged with traceback.
    """

    def decorator(func):
        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs):
            try:
                return await func(*args, **kwargs)
            except RuntimeError as e:
                raise HTTPException(status_code=503, detail=str(e)) from e
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e)) from e
            except HTTPException:
                raise
            except Exception as e:
                logger.exception("%s failed", func.__name__)
                raise HTTPException(status_code=502, detail=str(e)) from e

        @functools.wraps(func)
        def sync_wrapper(*args, **kwargs):
            try:
                return func(*args, **kwargs)
            except RuntimeError as e:
                raise HTTPException(status_code=503, detail=str(e)) from e
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e)) from e
            except HTTPException:
                raise
            except Exception as e:
                logger.exception("%s failed", func.__name__)
                raise HTTPException(status_code=502, detail=str(e)) from e

        return async_wrapper if inspect.iscoroutinefunction(func) else sync_wrapper

    return decorator
