"""
Optional Redis worker entrypoint.

Use this file if you decide to consume jobs directly from Redis/BullMQ-compatible
payload queues and call `run_deterministic_extraction`.
"""


def run_worker() -> None:
    # TODO: implement queue consumer integration
    raise NotImplementedError("Worker not implemented yet")
