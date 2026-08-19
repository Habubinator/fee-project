export class HttpError extends Error {
    constructor(
        public readonly statusCode: number,
        message: string,
    ) {
        super(message);
        this.name = this.constructor.name;
    }
}

export class BadRequestError         extends HttpError { constructor(msg = 'Bad request')          { super(400, msg); } }
export class UnauthorizedError       extends HttpError { constructor(msg = 'Unauthorized')          { super(401, msg); } }
export class PaymentRequiredError    extends HttpError { constructor(msg = 'Payment required')      { super(402, msg); } }
export class ForbiddenError          extends HttpError { constructor(msg = 'Forbidden')             { super(403, msg); } }
export class NotFoundError           extends HttpError { constructor(msg = 'Not found')             { super(404, msg); } }
export class ConflictError           extends HttpError { constructor(msg = 'Conflict')              { super(409, msg); } }
export class ServiceUnavailableError extends HttpError { constructor(msg = 'Service unavailable')   { super(503, msg); } }
