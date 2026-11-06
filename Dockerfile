FROM public.ecr.aws/lambda/python:3.12

COPY requirements.txt ${LAMBDA_TASK_ROOT}

RUN pip install --no-cache-dir -r requirements.txt

COPY src ${LAMBDA_TASK_ROOT}/src
COPY models ${LAMBDA_TASK_ROOT}/models

CMD ["src.lambda_handler.lambda_handler"]