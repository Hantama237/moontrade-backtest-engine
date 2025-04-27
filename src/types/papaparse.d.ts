declare module 'papaparse' {
  interface ParseConfig<T = any> {
    header?: boolean;
    skipEmptyLines?: boolean;
    complete?: (results: ParseResult<T>) => void;
    error?: (error: ParseError) => void;
  }

  interface ParseResult<T = any> {
    data: T[];
    errors: ParseError[];
    meta: ParseMeta;
  }

  interface ParseError {
    type: string;
    code: string;
    message: string;
    row: number;
  }

  interface ParseMeta {
    delimiter: string;
    linebreak: string;
    aborted: boolean;
    truncated: boolean;
    cursor: number;
  }

  function parse<T = any>(input: string, config?: ParseConfig<T>): ParseResult<T>;

  export default { parse };
} 