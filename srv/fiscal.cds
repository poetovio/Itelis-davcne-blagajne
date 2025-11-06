namespace fisc;

entity Invoice {
  key InvoiceId      : String(40);
      TaxNumber      : String(15);
      IssueDateTime  : Timestamp;
      Amount         : Decimal(15,2);
      PremiseId      : String(10);
      DeviceId       : String(10);
      ZOI            : String(32);
      Status         : String(12);
      CorrelationID  : String(64);
      IdempotencyKey : String(128);
      CreatedAt      : Timestamp @cds.on.insert : $now;
      UpdatedAt      : Timestamp @cds.on.update : $now;
}

entity Response {
  key InvoiceId_InvoiceId : Association to Invoice;
      EOR        : String(64);
      ReceivedAt : Timestamp;
      RawPayload : LargeString;
}

entity ErrorLog {
  key InvoiceId_InvoiceId : Association to Invoice;
      Code        : String(40);
      Message     : LargeString;
      RetryCount  : Integer;
      LastTriedAt : Timestamp;
}

/* Tipovi koje koristi handler */
type fisc_EventPayload : {
  invoiceId : String(40);
  taxNumber : String(15);
  amount    : Decimal(15,2);
  timestamp : Timestamp;
};

type EorAck : {
  invoiceId  : String(40);
  eor        : String(64);
  receivedAt : Timestamp;
  rawResponse: LargeString;
};

@path:'fiscalization'
@impl: 'srv/fiscalization-service.js'
service FiscalizationService {
  entity Invoices  as projection on fisc.Invoice;
  entity Responses as projection on fisc.Response;
  entity Errors    as projection on fisc.ErrorLog;

  action submitFromEvent(payload : fisc_EventPayload)
    returns { InvoiceId : String(40); Status : String(12); };

  action ackEOR(data : EorAck)
    returns { ok : Boolean; };

  function status(InvoiceId : String(40))
    returns { Status : String(12); ZOI : String(32); EOR : String(64); };

  action resend(InvoiceId : String(40)) returns { ok : Boolean; };
}
